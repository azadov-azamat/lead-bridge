/**
 * Per-user UI state — Redis backed.
 *
 * Bot reply keyboard tugmalari faqat matn yuboradi (callback_data yo'q),
 * shuning uchun har bir user qaysi "ekran"da turganini bilishimiz kerak.
 * Bu yerdagi state mahalliy klaviatura tugmalariga qarab text routerini
 * boshqarish uchun ishlatiladi.
 *
 * Mumkin bo'lgan screen qiymatlar:
 *   main          -> asosiy menyu (Sheetlarim / Sozlamalar)
 *   start         -> /start bosilgan, "🚀 Boshlash" keyboard ko'rsatilgan
 *   settings      -> sozlamalar menyusi
 *   language      -> til tanlash
 *   awaiting_phone -> contact request kutilmoqda
 *   gmail_picker  -> gmail tanlash yoki yozish
 *   verify_sheet  -> sheet uchun "Ulandim" tugmasi (data: sheetId)
 *   group_picker  -> sheet uchun guruh tanlash (data: sheetId)
 *   awaiting_group -> "Yangi guruh" tanlangan, bot guruhga qo'shilishini kutmoqda (data: sheetId)
 */

const redis = require('../redis');

const STATE_KEY = (telegramId) => `bot:state:${telegramId}`;
const STATE_TTL_SEC = 2 * 60 * 60; // 2 soat

async function setState(telegramId, screen, data = {}) {
  const payload = JSON.stringify({ screen, ...data });
  await redis.redis.set(STATE_KEY(telegramId), payload, 'EX', STATE_TTL_SEC);
}

async function getState(telegramId) {
  const raw = await redis.redis.get(STATE_KEY(telegramId));
  if (!raw) return { screen: 'main' };
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { screen: 'main' };
  }
}

async function clearState(telegramId) {
  await redis.redis.del(STATE_KEY(telegramId));
}

module.exports = {
  setState,
  getState,
  clearState,
};
