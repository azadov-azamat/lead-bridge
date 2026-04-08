require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const compression = require('compression');
const zlib = require('zlib');
const i18n = require('./server/services/i18n-config');
const errorHandler = require('./server/middleware/error-handler');
const bot = require('./server/bot-app/index');
const { isAllowedOrigin } = require('./server/utils/cors-origin');
const { logSanitizerMiddleware } = require('./server/utils/log-sanitizer');

const isTest = process.env.NODE_ENV === 'test';
const HEALTH_WEBHOOK_URL = 'https://logistics-backend-uufl.onrender.com/api/webhook_telegram';
const HEALTH_CHECK_TTL_MS = 5000;

let healthCache = {
  checkedAt: 0,
  isReady: false,
  hasValue: false,
};
let healthCheckPromise = null;

morgan.token('user-id', req => req.authenticatedUserId ?? 'anonymous');
morgan.token('sanitized-url', req => req.sanitizedUrl || req.path || req.url);
morgan.format(
  'custom',
  ':method :sanitized-url :status :res[content-length] - :response-time ms user-id=:user-id'
);

const corsOptions = function (req, callback) {
  let options = {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    exposedHeaders: true,
    allowedHeaders: [
      'X-Requested-With',
      'X-HTTP-Method-Override',
      'Content-Type',
      'Accept',
      'Cookie',
      'Authorization',
      'user-locale',
      'X-Device-Id',
      'X-Device-Model',
      'X-Device-Platform',
      'X-Device-UA',
      'X-Track',
      'X-Track-Event',
      'X-Track-Message',
      'X-Track-Meta',
    ],
  };

  const requestOrigin = req.header('Origin');
  options.origin = isAllowedOrigin(requestOrigin);
  callback(null, options);
};

const app = express();

// App settings
app.set('x-powered-by', false);
app.set('view cache', false);
app.set('query parser', 'extended');
app.set('trust proxy', true);

// Middleware
if (!isTest) {
  app.use(logSanitizerMiddleware);
  app.use(morgan('custom'));
}

app.use(
  compression({
    threshold: 1024, // compress responses over 1kb
    brotli: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }, // enable Brotli with moderate quality
  })
);

app.use(cookieParser());
app.use(i18n.init);
app.use(cors(corsOptions));

// Body parsers (no need for body-parser package)
app.use(express.urlencoded({ extended: false }));
app.use(
  express.json({
    strict: true,
    limit: '200kb',
    type: '*/*',
  })
);

// // Bot webhook
// app.use(bot.webhookCallback('/api/webhook_telegram'));

// Bot webhook (prod only)
if (process.env.NODE_ENV === 'production') {
  app.use(bot.webhookCallback('/api/webhook_telegram'));
}


const getCachedWebhookReadiness = async () => {
  const now = Date.now();
  if (healthCache.hasValue && now - healthCache.checkedAt < HEALTH_CHECK_TTL_MS) {
    return healthCache.isReady;
  }

  if (!healthCheckPromise) {
    healthCheckPromise = bot.telegram
      .getWebhookInfo()
      .then(webhookInfo => {
        healthCache = {
          checkedAt: Date.now(),
          isReady: webhookInfo.url === HEALTH_WEBHOOK_URL,
          hasValue: true,
        };

        return healthCache.isReady;
      })
      .finally(() => {
        healthCheckPromise = null;
      });
  }

  return healthCheckPromise;
};

// Health check
app.get('/health', async (req, res) => {
  const isReady = await getCachedWebhookReadiness();
  if (isReady) {
    res.status(200).send('Bot and webhook are ready to receive traffic');
  } else {
    res.status(503).send('Webhook is not ready or there are pending updates');
  }
});

// Global error handler
app.use(errorHandler);

module.exports = app;
