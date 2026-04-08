/**
 * Onboarding va sheet/group management — reply keyboard versiyasi.
 *
 * Loyihaning qoidasi: ALOHIDA aytilmagunicha — faqat reply keyboard tugmalari
 * (inline button yo'q). Tugma matnini matn router orqali "kalit"ga aylantirib,
 * foydalanuvchining joriy session.page ga qarab harakat qilamiz.
 *
 * Session redis'da `bot:session:{userId}` kalitida (state.js) saqlanadi va
 * `{ page, history, data }` ko'rinishida bo'ladi. Page o'zgarganda joriy page
 * history stack'ga push qilinadi — "🔙 Orqaga" tugmasi `popPage` orqali oson
 * qaytadi.
 *
 * Mumkin bo'lgan page'lar:
 *   start | main | settings | language |
 *   awaiting_phone | gmail_picker | verify_sheet (sheetId) |
 *   group_picker (sheetId) | awaiting_group (sheetId) |
 *   sheets_list (sheetIds) | confirm_delete (sheetId)
 *
 * High-level user.status faqat profil bosqichlari uchun:
 *   new -> awaiting_phone -> ready
 * (Sheet flow uchun status emas, balki session.page ishlatiladi.)
 */

const messages = require('./messages');
const keyboards = require('./keyboards');
const state = require('./state');
const { inferUserLanguage } = require('./i18n');
const db = require('../db');
const google = require('../google');
const redis = require('../redis');

const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

// Pending group assignment — sheet groupHandler tomonidan ham o'qiladi
const PENDING_GROUP_KEY = (telegramId) => `pending:group_assign:${telegramId}`;
const PENDING_TTL_SEC = 60 * 60;

async function setPendingGroupAssign(telegramId, sheetId) {
  await redis.redis.set(PENDING_GROUP_KEY(telegramId), String(sheetId), 'EX', PENDING_TTL_SEC);
}
async function getPendingGroupAssign(telegramId) {
  return redis.redis.get(PENDING_GROUP_KEY(telegramId));
}
async function clearPendingGroupAssign(telegramId) {
  await redis.redis.del(PENDING_GROUP_KEY(telegramId));
}

function register(bot) {
  // ============================================================
  // /commands
  // ============================================================
  bot.start(async (ctx) => {
    const user = ctx.user;
    const copy = ctx.copy;
    const isFirstTime = ctx.isFirstTime;
    if (!user) return;

    await state.resetToMain(user.telegramId);

    // 1) Telefoni bor — registratsiya tugagan, darhol main menyu
    if (user.phone) {
      await renderMain(ctx, user);
      return;
    }

    // 2) Birinchi marta — to'liq welcome + 🚀 Boshlash
    if (isFirstTime) {
      await state.setPage(user.telegramId, 'start');
      await ctx.replyWithHTML(
        copy.welcome(ctx.from.first_name),
        keyboards.startMenu(user.language)
      );
      return;
    }

    // 3) Oldin kelgan, lekin telefon bermay ketgan — qisqa prompt
    await db.updateUser(user.telegramId, { status: 'awaiting_phone' });
    await state.setPage(user.telegramId, 'awaiting_phone');
    await ctx.replyWithHTML(copy.askPhone, keyboards.requestPhone(user.language));
  });

  bot.command('status', async (ctx) => {
    if (!ctx.user) {
      await ctx.reply(ctx.copy?.notStarted || 'Avval /start ni bosing.');
      return;
    }
    await sendStatus(ctx, ctx.user);
  });

  bot.command('help', async (ctx) => {
    await ctx.replyWithHTML(ctx.copy.help, { disable_web_page_preview: true });
  });

  bot.command('language', async (ctx) => {
    if (!ctx.user) return;
    await pushLanguage(ctx, ctx.user);
  });

  bot.command('sheets', async (ctx) => {
    if (!ctx.user) {
      await ctx.reply(ctx.copy?.notStarted || 'Avval /start ni bosing.');
      return;
    }
    await pushSheetsList(ctx, ctx.user);
  });

  bot.command('newsheet', async (ctx) => {
    const user = ctx.user;
    if (!user || !user.phone) {
      await ctx.replyWithHTML(ctx.copy.newSheetNotReady);
      return;
    }
    await startNewSheetFlow(ctx, user);
  });

  bot.hears(/^\/verify_(\d+)$/, async (ctx) => {
    await handleVerifySheet(ctx, ctx.match[1]);
  });

  bot.command('changegroup', async (ctx) => {
    if (!ctx.user) {
      await ctx.reply(ctx.copy?.notStarted || 'Avval /start ni bosing.');
      return;
    }
    await ctx.replyWithHTML(ctx.copy.changeGroupNoCurrent);
  });

  // ============================================================
  // contact (telefon raqam)
  // ============================================================
  bot.on('contact', async (ctx) => {
    const user = ctx.user;
    if (!user) return;
    // Telefon allaqachon bor — qaytadan saqlamaymiz, foydalanuvchini main menyuga
    if (user.phone) {
      await renderMain(ctx, user);
      return;
    }

    const copy = ctx.copy;
    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from.id) {
      await ctx.reply(copy.sendOwnContact);
      return;
    }

    await db.updateUser(ctx.from.id, {
      phone: contact.phone_number,
      status: 'ready',
    });

    await ctx.replyWithHTML(copy.phoneSaved(contact.phone_number), keyboards.removeKeyboard);
    const updatedUser = await db.getUser(ctx.from.id);
    await startNewSheetFlow(ctx, updatedUser);
  });

  // ============================================================
  // text router — barcha reply keyboard tugmalari va matn input shu yerda
  // ============================================================
  bot.on('text', async (ctx, next) => {
    const text = (ctx.message.text || '').trim();
    if (text.startsWith('/')) return next();
    if (!ctx.user) return;
    await routeText(ctx, ctx.user, text);
  });
}

// ============================================================
// TEXT ROUTER
// ============================================================

async function routeText(ctx, user, text) {
  const copy = getCopy(user, ctx);
  const session = await state.getSession(user.telegramId);
  const labelKey = keyboards.matchLabel(text);

  // -------- Universal tugmalar --------

  // ❌ Bekor qilish — har joydan main menyuga, history tozalanadi
  if (labelKey === 'cancel') {
    await clearPendingGroupAssign(user.telegramId);
    await ctx.replyWithHTML(copy.cancelled);
    await renderMain(ctx, user);
    return;
  }

  // 🔙 Orqaga — history stack'dan oxirgi page'ni pop qilamiz va render qilamiz
  if (labelKey === 'back') {
    const previousPage = await state.popPage(user.telegramId);
    await renderPage(ctx, user, previousPage);
    return;
  }

  // 🇺🇿/🇷🇺 Til tanlash — har joydan ishlaydi
  if (labelKey === 'uz' || labelKey === 'ru') {
    await db.updateUser(user.telegramId, { language: labelKey });
    const updated = await db.getUser(user.telegramId);
    const updatedCopy = getCopy(updated, ctx);
    await ctx.replyWithHTML(updatedCopy.languageChanged);
    // Til tanlangach — orqaga (settings yoki main) qaytamiz
    const previousPage = await state.popPage(updated.telegramId);
    await renderPage(ctx, updated, previousPage);
    return;
  }

  // -------- Page-specific --------

  // start page
  if (session.page === 'start' || user.status === 'new') {
    if (labelKey === 'start') {
      await beginOnboarding(ctx, user);
      return;
    }
  }

  // awaiting_phone — text bo'lsa qayta so'raymiz
  if (session.page === 'awaiting_phone' || user.status === 'awaiting_phone') {
    await ctx.replyWithHTML(copy.askPhone, keyboards.requestPhone(user.language));
    return;
  }

  // gmail_picker
  if (session.page === 'gmail_picker') {
    // Gmail tugmasi (📧 user@gmail.com)
    const fromButton = keyboards.extractGmailFromButton(text);
    if (fromButton && GMAIL_REGEX.test(fromButton)) {
      await consumeGmailAndCreateSheet(ctx, user, fromButton);
      return;
    }
    // Inputga to'g'ridan-to'g'ri yangi gmail yozish
    if (GMAIL_REGEX.test(text)) {
      await consumeGmailAndCreateSheet(ctx, user, text);
      return;
    }
    await ctx.replyWithHTML(copy.invalidGmail);
    return;
  }

  // verify_sheet
  if (session.page === 'verify_sheet' && session.data?.sheetId) {
    if (labelKey === 'verified') {
      await handleVerifySheet(ctx, session.data.sheetId);
      return;
    }
  }

  // group_picker
  if (session.page === 'group_picker' && session.data?.sheetId) {
    const groupTitle = keyboards.extractGroupTitleFromButton(text);
    if (groupTitle) {
      const groups = await db.listUserGroups(user.telegramId);
      const matched = groups.find(
        (g) => (g.title || `ID ${g.id}`).startsWith(groupTitle.replace(/…$/, '')) ||
               groupTitle === (g.title || `ID ${g.id}`)
      );
      if (matched) {
        await assignGroupToSheet(ctx, user, session.data.sheetId, matched);
        return;
      }
    }
    if (labelKey === 'newGroup') {
      const sheet = await db.getSheet(session.data.sheetId);
      if (sheet && String(sheet.userTelegramId) === String(user.telegramId)) {
        await setPendingGroupAssign(user.telegramId, sheet.id);
        await state.pushPage(user.telegramId, 'awaiting_group', { sheetId: sheet.id });
        await ctx.replyWithHTML(copy.newGroupInstructions(sheet.title));
      }
      return;
    }
  }

  // sheets_list — "🗑 #N" tugmasi → tasdiqlash
  if (session.page === 'sheets_list' && Array.isArray(session.data?.sheetIds)) {
    const m = text.match(/^🗑\s*#(\d+)$/);
    if (m) {
      const idx = Number(m[1]) - 1;
      const sheetId = session.data.sheetIds[idx];
      if (sheetId) {
        const sheet = await db.getSheet(sheetId);
        if (sheet && String(sheet.userTelegramId) === String(user.telegramId)) {
          await state.pushPage(user.telegramId, 'confirm_delete', { sheetId });
          await ctx.replyWithHTML(
            copy.confirmDeleteSheet(sheet.title || `#${idx + 1}`),
            keyboards.confirmDeleteMenu(user.language)
          );
          return;
        }
      }
      await ctx.replyWithHTML(copy.sheetNotFound);
      return;
    }
  }

  // confirm_delete
  if (session.page === 'confirm_delete' && session.data?.sheetId) {
    if (labelKey === 'confirmYes') {
      const sheet = await db.getSheet(session.data.sheetId);
      if (sheet && String(sheet.userTelegramId) === String(user.telegramId)) {
        await db.softDeleteSheet(session.data.sheetId);
        await ctx.replyWithHTML(copy.sheetDeleted(sheet.title || ''));
      }
      // tasdiqlangach yoki rad etilgach — sheets_list ga qaytamiz
      await state.popPage(user.telegramId);
      await pushSheetsList(ctx, user, { skipPush: true });
      return;
    }
    if (labelKey === 'confirmNo') {
      await state.popPage(user.telegramId);
      await pushSheetsList(ctx, user, { skipPush: true });
      return;
    }
  }

  // -------- Main menyu (default) --------
  if (labelKey === 'mySheets') {
    await pushSheetsList(ctx, user);
    return;
  }
  if (labelKey === 'newSheet') {
    if (user.status !== 'ready') {
      await ctx.replyWithHTML(copy.newSheetNotReady);
      return;
    }
    await startNewSheetFlow(ctx, user);
    return;
  }
  if (labelKey === 'settings') {
    await pushSettings(ctx, user);
    return;
  }
  if (labelKey === 'language') {
    await pushLanguage(ctx, user);
    return;
  }
  if (labelKey === 'status') {
    await sendStatus(ctx, user);
    return;
  }
  if (labelKey === 'help') {
    await ctx.replyWithHTML(copy.help, { disable_web_page_preview: true });
    return;
  }

  // Tushunarsiz matn — main menyuga qaytamiz
  if (user.status === 'ready') {
    await renderMain(ctx, user);
  }
}

// ============================================================
// PAGE RENDERERS
// ============================================================

/**
 * Joriy page'ni nomi bo'yicha render qiladi (back tugmasi uchun ishlatiladi).
 * Faqat "menyu" pagelari bu yerda qo'llab-quvvatlanadi. Flow pagelari
 * (gmail_picker, verify_sheet, group_picker, ...) back orqali qaytmaydi —
 * ulardan ❌ Bekor qilish bilan chiqiladi.
 */
async function renderPage(ctx, user, page) {
  switch (page) {
    case 'settings':
      await renderSettings(ctx, user);
      return;
    case 'language':
      await renderLanguage(ctx, user);
      return;
    case 'sheets_list':
      await pushSheetsList(ctx, user, { skipPush: true });
      return;
    case 'main':
    default:
      await renderMain(ctx, user);
      return;
  }
}

async function renderMain(ctx, user) {
  const copy = getCopy(user, ctx);
  await state.resetToMain(user.telegramId);
  await ctx.replyWithHTML(copy.mainMenuHint, keyboards.mainMenu(user.language));
}

async function renderSettings(ctx, user) {
  const copy = getCopy(user, ctx);
  await state.setPage(user.telegramId, 'settings');
  await ctx.replyWithHTML(copy.settingsMenuHint, keyboards.settingsMenu(user.language));
}

async function pushSettings(ctx, user) {
  const copy = getCopy(user, ctx);
  await state.pushPage(user.telegramId, 'settings');
  await ctx.replyWithHTML(copy.settingsMenuHint, keyboards.settingsMenu(user.language));
}

async function renderLanguage(ctx, user) {
  const copy = getCopy(user, ctx);
  await state.setPage(user.telegramId, 'language');
  await ctx.replyWithHTML(copy.languageMenuHint, keyboards.languageMenu(user.language));
}

async function pushLanguage(ctx, user) {
  const copy = getCopy(user, ctx);
  await state.pushPage(user.telegramId, 'language');
  await ctx.replyWithHTML(copy.languageMenuHint, keyboards.languageMenu(user.language));
}

async function beginOnboarding(ctx, user) {
  const copy = getCopy(user, ctx);
  await db.updateUser(user.telegramId, { status: 'awaiting_phone' });
  await state.pushPage(user.telegramId, 'awaiting_phone');
  await ctx.replyWithHTML(copy.askPhone, keyboards.requestPhone(user.language));
}

async function pushSheetsList(ctx, user, { skipPush = false } = {}) {
  const copy = getCopy(user, ctx);
  const sheets = await db.listUserSheets(user.telegramId);
  const groups = await db.listUserGroups(user.telegramId);
  const groupMap = new Map(groups.map((g) => [String(g.id), g]));
  sheets.forEach((s) => {
    if (s.groupId) s.group = groupMap.get(String(s.groupId)) || null;
  });

  if (sheets.length === 0) {
    await ctx.replyWithHTML(copy.sheetsList(sheets), {
      disable_web_page_preview: true,
      ...keyboards.mainMenu(user.language),
    });
    await state.resetToMain(user.telegramId);
    return;
  }

  const sheetIds = sheets.map((s) => String(s.id));
  if (skipPush) {
    await state.setPage(user.telegramId, 'sheets_list', { sheetIds });
  } else {
    await state.pushPage(user.telegramId, 'sheets_list', { sheetIds });
  }

  await ctx.replyWithHTML(copy.sheetsList(sheets), {
    disable_web_page_preview: true,
    ...keyboards.sheetsListMenu(user.language, sheets),
  });
}

async function sendStatus(ctx, user) {
  const copy = getCopy(user, ctx);
  const sheets = await db.listUserSheets(user.telegramId);
  const isActive = await db.isUserActive(user.telegramId);
  await ctx.replyWithHTML(copy.status({ user, sheets, isActive }));
}

// ============================================================
// SHEET FLOW
// ============================================================

async function startNewSheetFlow(ctx, user) {
  const copy = getCopy(user, ctx);
  await state.pushPage(user.telegramId, 'gmail_picker');

  const gmails = await db.listUserGmails(user.telegramId);
  if (gmails.length > 0) {
    await ctx.replyWithHTML(
      copy.askGmailWithPicker,
      keyboards.gmailPicker(user.language, gmails)
    );
  } else {
    await ctx.replyWithHTML(copy.askGmail, keyboards.gmailPicker(user.language, []));
  }
}

async function consumeGmailAndCreateSheet(ctx, user, email) {
  const copy = getCopy(user, ctx);

  await ctx.replyWithHTML(copy.newSheetCreating);

  try {
    const title = `Lead Bridge — ${user.firstName || user.telegramId} — ${new Date().toISOString().slice(0, 10)}`;
    const { sheetId: spreadsheetId, sheetUrl: spreadsheetUrl } = await google.createSheetForUser({
      title,
      userEmail: email,
    });

    const sheet = await db.createSheet({
      userTelegramId: user.telegramId,
      spreadsheetId,
      spreadsheetUrl,
      title,
      gmail: email,
    });

    await state.pushPage(user.telegramId, 'verify_sheet', { sheetId: sheet.id });
    await ctx.replyWithHTML(
      copy.sheetCreated(spreadsheetUrl, false),
      keyboards.verifySheetMenu(user.language)
    );
  } catch (err) {
    console.error('[onboarding] sheet creation failed:', err.message);
    await ctx.replyWithHTML(copy.sheetCreateError(err.message));
    await renderMain(ctx, user);
  }
}

async function handleVerifySheet(ctx, sheetPk) {
  const sheet = await db.getSheet(sheetPk);
  const user = await db.getUser(ctx.from.id);
  const copy = getCopy(user, ctx);

  if (!sheet || String(sheet.userTelegramId) !== String(ctx.from.id)) {
    await ctx.replyWithHTML(copy.sheetNotFound);
    return;
  }

  if (sheet.status === 'verified') {
    await offerGroupForSheet(ctx, user, sheet);
    return;
  }

  await ctx.replyWithHTML(copy.verifying);
  const result = await google.verifyFacebookConnection(sheet.spreadsheetId);

  if (!result.verified) {
    await db.updateSheet(sheetPk, {
      status: 'pending_verification',
      errorReason: null,
    });
    await state.setPage(user.telegramId, 'verify_sheet', { sheetId: sheet.id });
    await ctx.replyWithHTML(
      copy.sheetVerifyFail(result.missing),
      keyboards.verifySheetMenu(user.language)
    );
    return;
  }

  await db.updateSheet(sheetPk, {
    status: 'verified',
    errorReason: null,
  });

  const refreshedSheet = await db.getSheet(sheetPk);
  await offerGroupForSheet(ctx, user, refreshedSheet);
}

async function offerGroupForSheet(ctx, user, sheet) {
  const copy = getCopy(user, ctx);
  const groups = await db.listUserGroups(user.telegramId);

  if (groups.length === 0) {
    await setPendingGroupAssign(user.telegramId, sheet.id);
    await state.setPage(user.telegramId, 'awaiting_group', { sheetId: sheet.id });
    await ctx.replyWithHTML(
      copy.askGroupNoExisting(sheet.title),
      keyboards.mainMenu(user.language)
    );
    return;
  }

  await state.setPage(user.telegramId, 'group_picker', { sheetId: sheet.id });
  await ctx.replyWithHTML(
    copy.askGroupForSheet(sheet.title),
    keyboards.groupPicker(user.language, groups)
  );
}

async function assignGroupToSheet(ctx, user, sheetPk, group) {
  const copy = getCopy(user, ctx);
  const sheet = await db.getSheet(sheetPk);
  if (!sheet || String(sheet.userTelegramId) !== String(user.telegramId)) {
    await ctx.replyWithHTML(copy.sheetNotFound);
    return;
  }
  await db.updateSheet(sheetPk, { groupId: group.id });
  await clearPendingGroupAssign(user.telegramId);
  await ctx.replyWithHTML(
    copy.sheetGroupBound(sheet.title, group.title || `ID ${group.id}`)
  );
  await renderMain(ctx, user);
}

// ============================================================
// helpers
// ============================================================

/**
 * Foydalanuvchi tilidagi messages obyektini ctx dan oladi.
 * Auth middleware ctx.copy ni o'rnatadi; agar yo'q bo'lsa user.language ga
 * fallback qilamiz.
 */
function getCopy(user, ctx) {
  if (ctx?.copy) return ctx.copy;
  return messages.forLanguage(inferUserLanguage(user, ctx?.from?.language_code));
}

module.exports = {
  register,
  // groupHandler integration
  getPendingGroupAssign,
  clearPendingGroupAssign,
};
