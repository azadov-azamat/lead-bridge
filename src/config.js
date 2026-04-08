require('dotenv').config();

function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} .env faylida ko'rsatilmagan`);
  }
  return value;
}

function optional(key) {
  const value = process.env[key];
  return value ? value.trim() : '';
}

function intOpt(key, fallback) {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  nodeEnv: optional('NODE_ENV') || 'development',
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),

  // --- Google (faqat OAuth — service account fallback olib tashlandi) ---
  googleOAuthClientId: required('GOOGLE_OAUTH_CLIENT_ID'),
  googleOAuthClientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
  googleOAuthRefreshToken: required('GOOGLE_OAUTH_REFRESH_TOKEN'),
  googleOwnerEmail: optional('GOOGLE_OWNER_EMAIL').toLowerCase(),

  // --- Postgres (Render) ---
  databaseUrl: required('DATABASE_URL'),
  // Render external Postgres SSL talab qiladi; rejectUnauthorized=false standart pattern.
  databaseSsl: optional('DATABASE_SSL') !== 'false',
  databaseLogging: optional('DATABASE_LOGGING') === 'true',

  // --- Redis (Render Key Value) ---
  redisUrl: required('REDIS_URL'),

  // --- HTTP server ---
  port: intOpt('PORT', 8080),
  // Production'da Render external URL (https://...). Webhook shu URL ostiga register qilinadi.
  // Bo'sh bo'lsa va NODE_ENV=production bo'lsa — boot xato beradi.
  backHostName: optional('BACK_HOST_NAME'),
  // Webhook path (BotFather tomonidan ko'rinmasligi uchun "secret-ish" bo'lishi mumkin)
  webhookPath: optional('WEBHOOK_PATH') || '/api/webhook_telegram',

  // --- Cluster (multi-worker) ---
  // null bo'lsa CPU count ishlatiladi. Render free tier uchun 1 yetarli.
  webConcurrency: process.env.WEB_CONCURRENCY ? intOpt('WEB_CONCURRENCY', 1) : null,
  // Bot va poller faqat shu ID dagi worker'da ishga tushadi.
  // Boshqa workerlar faqat HTTP webhook callback xizmat qiladi.
  botPrimaryWorker: intOpt('BOT_PRIMARY_WORKER', 1),

  // --- Memory monitor ---
  memoryMaxHeapMb: intOpt('MEMORY_MAX_HEAP_MB', 400),
  memoryCriticalHeapMb: intOpt('MEMORY_CRITICAL_HEAP_MB', 450),
  memoryCheckIntervalMs: intOpt('MEMORY_CHECK_INTERVAL_MS', 2 * 60 * 1000),

  // --- Poller ---
  pollIntervalMs: intOpt('POLL_INTERVAL_MS', 60000),
  // Distributed lock TTL — bitta tick maksimal davomiyligi.
  pollerLockTtlMs: intOpt('POLLER_LOCK_TTL_MS', 300000),
};
