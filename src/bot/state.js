/**
 * Per-user UI session — Redis backed.
 *
 * Reply keyboard tugmalari faqat matn yuboradi (callback_data yo'q),
 * shuning uchun har bir user qaysi "page" da turganini bilishimiz kerak.
 * Page o'zgarganda navigatsiya tarixi `history` stack'ga push qilinadi.
 * "🔙 Orqaga" tugmasi shu tarixdan oxirgi page'ni pop qiladi — natijada
 * istalgan chuqurlikdagi menyudan oson qaytib chiqiladi.
 *
 * Session shakli (Redis JSON):
 *   {
 *     page:     'main' | 'start' | 'settings' | 'language' |
 *               'awaiting_phone' | 'gmail_picker' | 'verify_sheet' |
 *               'group_picker' | 'awaiting_group' | 'sheets_list' | 'confirm_delete',
 *     history:  [page, page, ...],   // navigatsiya stack
 *     data:     { ... }              // joriy page uchun qo'shimcha kontekst (sheetId, sheetIds, ...)
 *   }
 */

const redis = require('../redis');

const SESSION_KEY = (telegramId) => `bot:session:${telegramId}`;
const SESSION_TTL_SEC = 2 * 60 * 60; // 2 soat

const DEFAULT_SESSION = { page: 'main', history: [], data: {} };

async function getSession(telegramId) {
  const raw = await redis.redis.get(SESSION_KEY(telegramId));
  if (!raw) return { ...DEFAULT_SESSION };
  try {
    const parsed = JSON.parse(raw);
    return {
      page: parsed.page || 'main',
      history: Array.isArray(parsed.history) ? parsed.history : [],
      data: parsed.data || {},
    };
  } catch (_) {
    return { ...DEFAULT_SESSION };
  }
}

async function saveSession(telegramId, session) {
  await redis.redis.set(
    SESSION_KEY(telegramId),
    JSON.stringify(session),
    'EX',
    SESSION_TTL_SEC
  );
}

/**
 * Joriy page'ni yangi page bilan almashtiradi (history'ga tegmaydi).
 * O'sha pagedagi qayta-render uchun.
 */
async function setPage(telegramId, page, data = {}) {
  const session = await getSession(telegramId);
  session.page = page;
  session.data = data;
  await saveSession(telegramId, session);
  return session;
}

/**
 * Yangi page'ga o'tish: joriy page history stack'ga push, yangi page o'rnatiladi.
 * Agar yangi page joriy bilan bir xil bo'lsa, history o'zgartirilmaydi.
 */
async function pushPage(telegramId, page, data = {}) {
  const session = await getSession(telegramId);
  if (session.page && session.page !== page) {
    session.history.push(session.page);
    // history hajmini cheklab qo'yamiz (nazorat uchun)
    if (session.history.length > 20) session.history.shift();
  }
  session.page = page;
  session.data = data;
  await saveSession(telegramId, session);
  return session;
}

/**
 * History'dan oxirgi page'ni pop qilib, joriy page sifatida o'rnatadi.
 * Agar history bo'sh bo'lsa, 'main' ga qaytadi.
 * Qaytadi: yangi joriy page nomi.
 */
async function popPage(telegramId) {
  const session = await getSession(telegramId);
  const previous = session.history.pop();
  session.page = previous || 'main';
  session.data = {};
  await saveSession(telegramId, session);
  return session.page;
}

/**
 * Sessionni 'main' ga qaytaradi va history'ni tozalaydi.
 */
async function resetToMain(telegramId) {
  await saveSession(telegramId, { page: 'main', history: [], data: {} });
}

async function clearSession(telegramId) {
  await redis.redis.del(SESSION_KEY(telegramId));
}

module.exports = {
  getSession,
  setPage,
  pushPage,
  popPage,
  resetToMain,
  clearSession,
};
