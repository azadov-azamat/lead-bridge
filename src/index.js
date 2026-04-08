/**
 * Bootstrap entry point.
 *
 * Boot ketma-ketligi:
 *   1. Postgres ulanish (sequelize.authenticate)
 *   2. Pending migration'larni qo'llash (umzug.up — idempotent)
 *   3. Redis ready'ni kutish
 *   4. HTTP server'ni `PORT` da launch qilish
 *   5. Bot'ni dual rejimda ishga tushirish:
 *        - production → webhook (setWebhook + drop pending updates)
 *        - development → long polling (deleteWebhook + bot.launch)
 *   6. Poller (Redis lock bilan)
 *
 * Graceful shutdown (SIGINT/SIGTERM):
 *   poller.stop → bot.stop / deleteWebhook → http server.close → redis.quit → sequelize.close
 */

const http = require('http');

const config = require('./config');
const app = require('./app');
const bot = require('./bot');
const poller = require('./poller');
const redis = require('./redis');
const { sequelize } = require('./db/models');
const { migrator } = require('./db/umzug');

const isProd = config.nodeEnv === 'production';

let server = null;
let isShuttingDown = false;

async function main() {
  // ---- 1. Postgres ----
  await sequelize.authenticate();
  console.log('[db] Postgres ulanish OK');

  // ---- 2. Migrations ----
  const applied = await migrator.up();
  if (applied.length > 0) {
    console.log(`[db] ${applied.length} ta migration qo'llandi:`, applied.map((m) => m.name));
  } else {
    console.log("[db] migration o'zgarishlari yo'q");
  }

  // ---- 3. Redis ----
  if (redis.redis.status !== 'ready') {
    await new Promise((resolve, reject) => {
      const onReady = () => {
        redis.redis.off('error', onErr);
        resolve();
      };
      const onErr = (err) => {
        redis.redis.off('ready', onReady);
        reject(err);
      };
      redis.redis.once('ready', onReady);
      redis.redis.once('error', onErr);
    });
  }

  // ---- 4. HTTP server ----
  server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => {
      server.off('error', reject);
      console.log(`[http] ${config.port} portda tinglanmoqda`);
      resolve();
    });
  });

  // ---- 5. Bot (dual mode) ----
  if (isProd) {
    if (!config.backHostName) {
      throw new Error('BACK_HOST_NAME .env da ko\'rsatilmagan (production webhook URL kerak)');
    }
    const webhookUrl = `${config.backHostName}${config.webhookPath}`;
    await bot.telegram.setWebhook(webhookUrl, {
      drop_pending_updates: false,
    });
    console.log(`[bot] webhook set: ${webhookUrl}`);
  } else {
    // Dev: webhook'ni o'chirib, polling'ni boshlaymiz
    await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    if (!bot.__launched) {
      bot.launch({ polling: { timeout: 30, limit: 50 } });
      bot.__launched = true;
      console.log('[bot] polling boshlandi (development)');
    }
  }

  const me = await bot.telegram.getMe();
  console.log(`[bot] @${me.username} ishga tushdi`);

  // ---- 6. Poller ----
  poller.start(bot);
}

// ============================================================
// Graceful shutdown
// ============================================================

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[shutdown] ${signal} qabul qilindi, yopilmoqda...`);

  // Poller (interval) ni darhol to'xtatamiz
  try {
    poller.stop();
  } catch (err) {
    console.error('[shutdown] poller.stop xato:', err.message);
  }

  // Bot'ni to'xtatamiz
  try {
    if (isProd) {
      await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    } else if (bot.__launched) {
      bot.stop(signal);
      bot.__launched = false;
    }
  } catch (err) {
    console.error('[shutdown] bot stop xato:', err.message);
  }

  // HTTP server'ni yopamiz (yangi connection qabul qilmaydi)
  if (server) {
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) console.error('[shutdown] server.close xato:', err.message);
        resolve();
      });
    });
  }

  // Redis va Postgres
  await redis.close().catch((e) => console.error('[shutdown] redis xato:', e.message));
  await sequelize.close().catch((e) => console.error('[shutdown] sequelize xato:', e.message));

  console.log('[shutdown] tayyor');
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Process-level safety nets
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err);
  // Bu xato'dan recover qilish xavfli — toza yopamiz
  shutdown('uncaughtException');
});

main().catch((err) => {
  console.error('[boot] xato:', err);
  process.exit(1);
});
