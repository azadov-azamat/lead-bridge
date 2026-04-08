/**
 * Redis client + distributed lock helper.
 *
 * Render Redis "rediss://" sxemasidan foydalanadi (TLS). ioredis URL'dan
 * avtomatik aniqlaydi, lekin self-signed sertifikat uchun TLS optsiyasi qo'shamiz.
 *
 * `withLock(key, ttl, fn)`:
 *   Faqat bitta jarayon bir vaqtning o'zida `fn` ni bajarishiga ruxsat beradi.
 *   Lock'ni SET NX EX orqali oladi va tugagach (yoki crash bo'lsa TTL bilan)
 *   ozod qiladi. Lock olinmasa fn ishlamaydi va `null` qaytariladi.
 */

const Redis = require('ioredis');
const config = require('./config');

const isTls = config.redisUrl.startsWith('rediss://');

const redis = new Redis(config.redisUrl, {
  // ioredis URL'dan host/port/auth/db ni avtomatik o'qiydi
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  // rediss:// uchun TLS, Render self-signed sertifikat ishlatadi
  tls: isTls ? { rejectUnauthorized: false } : undefined,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
});

redis.on('error', (err) => {
  // Tinch log — retry o'zi ishlaydi
  console.error('[redis] xato:', err.message);
});

redis.on('connect', () => {
  console.log('[redis] ulanmoqda...');
});

redis.on('ready', () => {
  console.log('[redis] tayyor');
});

/**
 * Distributed lock. Lock muvaffaqiyatli olinsa fn'ni bajaradi va natijasini
 * qaytaradi. Aks holda `null` qaytaradi (boshqa instance ushlab turibdi).
 *
 * @param {string} key       — lock kaliti, masalan "lock:poller:tick"
 * @param {number} ttlMs     — lock TTL (millisekund). Crash himoya uchun.
 * @param {Function} fn      — async funksiya
 */
async function withLock(key, ttlMs, fn) {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') {
    return null;
  }
  try {
    return await fn();
  } finally {
    // Faqat bizning token bo'lsa o'chirish (Lua atomic)
    const releaseScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await redis.eval(releaseScript, 1, key, token);
    } catch (err) {
      console.warn('[redis] lock release xato:', err.message);
    }
  }
}

async function close() {
  try {
    await redis.quit();
  } catch (_) {
    redis.disconnect();
  }
}

module.exports = {
  redis,
  withLock,
  close,
};
