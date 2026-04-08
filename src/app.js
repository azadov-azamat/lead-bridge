/**
 * Express HTTP application.
 *
 * Loyiha bot bo'lsa-da, HTTP server kerak:
 *   1. `/health` — Render service uptime monitoringi shuni so'raydi
 *   2. Webhook endpoint — production'da Telegraf'ning long-pollingsiz rejimi
 *
 * Production: Telegram → POST {webhookPath} → bot.handleUpdate
 * Development: bot polling rejimida ishlaydi, webhook callback registered emas
 *
 * Bu yerda boshqa middleware (cors, cookies, i18n) yo'q — bizda public API yo'q.
 */

const express = require('express');
const morgan = require('morgan');

const config = require('./config');
const bot = require('./bot');

const app = express();

// --- App settings ---
app.set('x-powered-by', false);
app.set('trust proxy', true);

// --- Middleware ---
// Faqat development va production'da, test'da log shovqin bo'lmasligi uchun
if (config.nodeEnv !== 'test') {
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'tiny'));
}

// JSON body parser — Telegram webhook POST payload uchun (max ~100KB)
app.use(express.json({ limit: '200kb' }));

// --- Telegram webhook (faqat production) ---
// Dev'da bot polling ishlatadi, webhook callback registered bo'lmasligi kerak.
if (config.nodeEnv === 'production') {
  app.use(bot.webhookCallback(config.webhookPath));
}

// ============================================================
// Health check
// ============================================================
//
// Render bu endpoint'ni ~30s da bir marta so'raydi. Agar 503 qaytsa,
// service "unhealthy" deb belgilanadi. Shuning uchun bu endpoint
// **tashqi chaqiruvlar qilmasligi** kerak (yoki cache bilan).
//
// Production'da Telegram webhook URL to'g'ri set qilinganini tekshiramiz.
// Cached 5s — Telegram API'ga cheksiz so'rov yubormaslik uchun.

const HEALTH_CHECK_TTL_MS = 5000;
let healthCache = { checkedAt: 0, isReady: false, hasValue: false };
let healthCheckPromise = null;

async function getCachedWebhookReadiness() {
  // Dev rejimida polling ishlatamiz — webhook tekshiruvi keraksiz
  if (config.nodeEnv !== 'production') {
    return true;
  }

  const now = Date.now();
  if (healthCache.hasValue && now - healthCache.checkedAt < HEALTH_CHECK_TTL_MS) {
    return healthCache.isReady;
  }

  // Inflight guard — bir vaqtda faqat bitta tekshiruv
  if (!healthCheckPromise) {
    const expectedUrl = `${config.backHostName}${config.webhookPath}`;
    healthCheckPromise = bot.telegram
      .getWebhookInfo()
      .then((webhookInfo) => {
        healthCache = {
          checkedAt: Date.now(),
          isReady: webhookInfo.url === expectedUrl,
          hasValue: true,
        };
        return healthCache.isReady;
      })
      .catch((err) => {
        console.error('[health] getWebhookInfo xato:', err.message);
        return false;
      })
      .finally(() => {
        healthCheckPromise = null;
      });
  }
  return healthCheckPromise;
}

app.get('/health', async (_req, res) => {
  try {
    const isReady = await getCachedWebhookReadiness();
    if (isReady) {
      res.status(200).json({ status: 'ok', mode: config.nodeEnv === 'production' ? 'webhook' : 'polling' });
    } else {
      res.status(503).json({ status: 'unhealthy', reason: 'webhook not registered' });
    }
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', reason: err.message });
  }
});

// Root — odam ko'rsa, nima ekanini bilsin
app.get('/', (_req, res) => {
  res.type('text/plain').send('Lead Bridge bot — see /health');
});

// --- 404 handler ---
app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// --- Global error handler ---
app.use((err, _req, res, _next) => {
  console.error('[express] xato:', err);
  res.status(500).json({ error: 'internal server error' });
});

module.exports = app;
