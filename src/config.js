require('dotenv').config();
const path = require('path');

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

module.exports = {
  nodeEnv: optional('NODE_ENV') || 'development',
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),

  // --- Google ---
  googleAuthMode: 'oauth',
  googleOAuthClientId: optional('GOOGLE_OAUTH_CLIENT_ID'),
  googleOAuthClientSecret: optional('GOOGLE_OAUTH_CLIENT_SECRET'),
  googleOAuthRefreshToken: optional('GOOGLE_OAUTH_REFRESH_TOKEN'),
  googleOwnerEmail: optional('GOOGLE_OWNER_EMAIL').toLowerCase(),
  googleCredentialsPath: path.resolve(
    process.env.GOOGLE_CREDENTIALS_PATH || './credentials/service-account.json'
  ),

  // --- Postgres (Render) ---
  databaseUrl: required('DATABASE_URL'),
  // Render external Postgres SSL talab qiladi; rejectUnauthorized=false standart pattern.
  databaseSsl: optional('DATABASE_SSL') !== 'false',
  databaseLogging: optional('DATABASE_LOGGING') === 'true',

  // --- Redis (Render Key Value) ---
  redisUrl: required('REDIS_URL'),

  // --- HTTP server ---
  port: parseInt(process.env.PORT || '8080', 10),
  // Production'da Render external URL (https://...). Webhook shu URL ostiga register qilinadi.
  // Bo'sh bo'lsa va NODE_ENV=production bo'lsa — boot xato beradi.
  backHostName: optional('BACK_HOST_NAME'),
  // Webhook path (BotFather tomonidan ko'rinmasligi uchun "secret-ish" bo'lishi mumkin)
  webhookPath: optional('WEBHOOK_PATH') || '/api/webhook_telegram',

  // --- Poller ---
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '60000', 10),
  // Distributed lock TTL — bitta tick maksimal davomiyligi.
  pollerLockTtlMs: parseInt(process.env.POLLER_LOCK_TTL_MS || '300000', 10),

  adminTelegramId: process.env.ADMIN_TELEGRAM_ID
    ? parseInt(process.env.ADMIN_TELEGRAM_ID, 10)
    : null,
};
