/**
 * Auth middleware — har xabar (update) uchun bitta marta ishlaydi.
 *
 * Vazifalari:
 *   1. Telegram'dan kelgan ctx.from bo'yicha userni jadvaldan topadi yoki yaratadi.
 *   2. Foydalanuvchi profilidagi name/username/language ni Telegram'dagi
 *      qiymatlar bilan sinxronlaydi.
 *   3. Joriy session'ni Redis'dan o'qib, ctx ga biriktiradi.
 *   4. Status normallashtiradi: agar telefon raqami bor lekin status 'ready'/
 *      'awaiting_phone' emas (eski "awaiting_gmail" kabi qoldiqlar) — 'ready' ga
 *      o'tkazadi. Bu /start ni qaytadan registratsiyaga olib borishini oldini oladi.
 *   5. ctx ga shu maydonlarni qo'yadi:
 *        ctx.user        — DB userning toJSON natijasi
 *        ctx.session     — { page, history, data } (Redis dan)
 *        ctx.copy        — messages.forLanguage(...) — pastki layerlarda qulay
 *        ctx.isFirstTime — userning shu jarayon davomida birinchi yaratilishi
 *
 *   Channel post / kanal kontekstida ctx.from bo'lmaydi — bu holatda xavfsiz
 *   chiqamiz va kerak bo'lsa botni guruhdan/kanaldan chiqaramiz.
 *
 * Reference: src/middleware/auth.js — boshqa loyihadan adaptatsiya qilindi
 * (bizda subscription/agreement/i18n setLocale yo'q, shularsiz ishlatildi).
 */

const db = require('../db');
const state = require('./state');
const messages = require('./messages');
const { inferUserLanguage } = require('./i18n');

async function auth(ctx, next) {
  // Channel post yoki noma'lum source — xavfsiz chiqamiz.
  if (!ctx.from) {
    if (ctx.chat?.id && (ctx.chat.type === 'channel')) {
      console.log(`[auth] kanaldan kelgan update, chat=${ctx.chat.id} — leaveChat`);
      try {
        await ctx.leaveChat();
      } catch (err) {
        console.error('[auth] leaveChat xato:', err.message);
      }
    }
    return;
  }

  // Guruh ichidagi messagelarni shu yerda boshqarmaymiz — groupHandler/poller
  // o'z ishini bajaradi. Faqat private chat uchun user contextini qurish.
  const isPrivate = ctx.chat?.type === 'private';
  if (!isPrivate) {
    return next();
  }

  const { id, first_name: firstName, username } = ctx.from;

  // Userni topamiz yoki yaratamiz
  let upserted;
  try {
    upserted = await db.upsertUser({
      telegramId: id,
      username,
      firstName,
      language: ctx.from.language_code,
    });
  } catch (err) {
    console.error('[auth] upsertUser xato:', err.message);
    return;
  }

  let user = await db.getUser(id);
  if (!user) {
    console.error('[auth] user topilmadi (upsert dan keyin):', id);
    return;
  }

  const isFirstTime = !!upserted.__created;

  // Status normallashtirish:
  //   - phone bor + status hali 'new'/'awaiting_gmail'/eski qoldiqlar bo'lsa,
  //     'ready' ga o'tkazamiz. Bu eng asosiy bug fix: foydalanuvchi /start
  //     bosgani bilan qaytadan ro'yxatdan o'tkazilmasin.
  //   - phone yo'q va status 'ready' bo'lsa (yaroqsiz holat) — 'new' ga.
  if (user.phone && user.status !== 'ready' && user.status !== 'awaiting_phone') {
    await db.updateUser(id, { status: 'ready' });
    user = await db.getUser(id);
  } else if (!user.phone && user.status === 'ready') {
    await db.updateUser(id, { status: 'new' });
    user = await db.getUser(id);
  }

  // Sessionni Redis'dan o'qib ctx ga biriktiramiz
  const session = await state.getSession(id);

  ctx.user = user;
  ctx.session = session;
  ctx.isFirstTime = isFirstTime;
  ctx.copy = messages.forLanguage(inferUserLanguage(user, ctx.from.language_code));

  return next();
}

module.exports = { auth };
