/**
 * Onboarding va sheet/group management — reply keyboard versiyasi.
 *
 * Loyihaning qoidasi: ALOHIDA aytilmagunicha — faqat reply keyboard tugmalari
 * (inline button yo'q). Tugma matnini matn router orqali "kalit"ga aylantirib,
 * foydalanuvchining joriy state'iga qarab harakat qilamiz.
 *
 * State'lar redis'da `bot:state:{userId}` kalitida saqlanadi (state.js).
 * Mumkin bo'lgan ekranlar:
 *   start | main | settings | language |
 *   awaiting_phone | gmail_picker | verify_sheet (sheetId) |
 *   group_picker (sheetId) | awaiting_group (sheetId)
 */

const messages = require('./messages');
const keyboards = require('./keyboards');
const state = require('./state');
const { inferUserLanguage, normalizeLanguage } = require('./i18n');
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
    const { user, isFirstTime } = await ensureUser(ctx);
    const copy = getCopy(user, ctx);

    if (isFirstTime) {
      // Birinchi marta — faqat welcome (start tugmasi bilan)
      await state.setState(user.telegramId, 'start');
      await ctx.replyWithHTML(
        copy.welcome(ctx.from.first_name),
        keyboards.startMenu(user.language)
      );
      return;
    }

    // Qaytib kelgan user — to'g'ridan-to'g'ri tegishli menyu
    if (user.status === 'ready') {
      await showMainMenu(ctx, user);
    } else if (user.status === 'awaiting_phone') {
      await ctx.replyWithHTML(copy.askPhone, keyboards.requestPhone(user.language));
      await state.setState(user.telegramId, 'awaiting_phone');
    } else {
      await state.setState(user.telegramId, 'start');
      await ctx.reply(copy.mainMenuHint, keyboards.startMenu(user.language));
    }
  });

  bot.command('status', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user) {
      await ctx.reply(messages.forLanguage(ctx.from.language_code).notStarted);
      return;
    }
    await sendStatus(ctx, user);
  });

  bot.command('help', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    await ctx.replyWithHTML(getCopy(user, ctx).help, {
      disable_web_page_preview: true,
    });
  });

  bot.command('language', async (ctx) => {
    const { user } = await ensureUser(ctx);
    await showLanguageMenu(ctx, user);
  });

  bot.command('sheets', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user) {
      await ctx.reply(messages.forLanguage(ctx.from.language_code).notStarted);
      return;
    }
    await sendSheetsList(ctx, user);
  });

  bot.command('newsheet', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    const copy = getCopy(user, ctx);
    if (!user || user.status !== 'ready') {
      await ctx.replyWithHTML(copy.newSheetNotReady);
      return;
    }
    await startNewSheetFlow(ctx, user);
  });

  bot.hears(/^\/verify_(\d+)$/, async (ctx) => {
    await handleVerifySheet(ctx, ctx.match[1]);
  });

  bot.command('changegroup', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    const copy = getCopy(user, ctx);
    if (!user) {
      await ctx.reply(copy.notStarted);
      return;
    }
    await ctx.replyWithHTML(copy.changeGroupNoCurrent);
  });

  // ============================================================
  // contact (telefon raqam)
  // ============================================================
  bot.on('contact', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user) return;
    const cur = await state.getState(ctx.from.id);
    if (user.status !== 'awaiting_phone' && cur.screen !== 'awaiting_phone') return;

    const copy = getCopy(user, ctx);
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

    const user = await db.getUser(ctx.from.id);
    if (!user) return;

    await routeText(ctx, user, text);
  });
}

// ============================================================
// TEXT ROUTER
// ============================================================

async function routeText(ctx, user, text) {
  const copy = getCopy(user, ctx);
  const cur = await state.getState(user.telegramId);
  const labelKey = keyboards.matchLabel(text);

  // Universal: Bekor qilish — har joydan main menyuga
  if (labelKey === 'cancel') {
    await clearPendingGroupAssign(user.telegramId);
    await ctx.replyWithHTML(copy.cancelled);
    await showMainMenu(ctx, user);
    return;
  }

  // Universal: Orqaga
  if (labelKey === 'back') {
    if (cur.screen === 'language') {
      await showSettingsMenu(ctx, user);
    } else {
      await showMainMenu(ctx, user);
    }
    return;
  }

  // Universal: tilni tanlash (har joydan)
  if (labelKey === 'uz' || labelKey === 'ru') {
    await db.updateUser(user.telegramId, { language: labelKey });
    const updated = await db.getUser(user.telegramId);
    const updatedCopy = getCopy(updated, ctx);
    await ctx.replyWithHTML(updatedCopy.languageChanged);
    await showSettingsMenu(ctx, updated);
    return;
  }

  // ----- screen-specific -----

  if (cur.screen === 'start' || user.status === 'new') {
    if (labelKey === 'start') {
      await beginOnboarding(ctx, user);
      return;
    }
  }

  if (cur.screen === 'awaiting_phone' || user.status === 'awaiting_phone') {
    // Telefon contact orqali yuboriladi — text bo'lsa qayta so'raymiz
    await ctx.replyWithHTML(copy.askPhone, keyboards.requestPhone(user.language));
    return;
  }

  if (cur.screen === 'gmail_picker' || user.status === 'awaiting_gmail') {
    // 1. Gmail tugmasini bosgan bo'lishi mumkin (📧 user@gmail.com)
    const fromButton = keyboards.extractGmailFromButton(text);
    if (fromButton && GMAIL_REGEX.test(fromButton)) {
      await consumeGmailAndCreateSheet(ctx, user, fromButton);
      return;
    }
    // 2. "Yangi gmail" tugmasi
    if (labelKey === 'newGmail') {
      await ctx.replyWithHTML(copy.typeNewGmail);
      return;
    }
    // 3. Yangi gmail manzilini xabarda yozishi mumkin
    if (GMAIL_REGEX.test(text)) {
      await consumeGmailAndCreateSheet(ctx, user, text);
      return;
    }
    // 4. Boshqa narsa — invalid
    await ctx.replyWithHTML(copy.invalidGmail);
    return;
  }

  if (cur.screen === 'verify_sheet' && cur.sheetId) {
    if (labelKey === 'verified') {
      await handleVerifySheet(ctx, cur.sheetId);
      return;
    }
  }

  if (cur.screen === 'group_picker' && cur.sheetId) {
    // Mavjud guruh tugmasi — title bo'yicha topamiz
    const groupTitle = keyboards.extractGroupTitleFromButton(text);
    if (groupTitle) {
      const groups = await db.listUserGroups(user.telegramId);
      const matched = groups.find(
        (g) => (g.title || `ID ${g.id}`).startsWith(groupTitle.replace(/…$/, '')) ||
               groupTitle === (g.title || `ID ${g.id}`)
      );
      if (matched) {
        await assignGroupToSheet(ctx, user, cur.sheetId, matched);
        return;
      }
    }
    if (labelKey === 'newGroup') {
      const sheet = await db.getSheet(cur.sheetId);
      if (sheet && String(sheet.userTelegramId) === String(user.telegramId)) {
        await setPendingGroupAssign(user.telegramId, sheet.id);
        await state.setState(user.telegramId, 'awaiting_group', { sheetId: sheet.id });
        await ctx.replyWithHTML(copy.newGroupInstructions(sheet.title));
      }
      return;
    }
  }

  // ----- main menu (default) -----
  if (labelKey === 'mySheets') {
    await sendSheetsList(ctx, user);
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
    await showSettingsMenu(ctx, user);
    return;
  }
  if (labelKey === 'language') {
    await showLanguageMenu(ctx, user);
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

  // Tushunarsiz matn — main menyuga eslatma
  if (user.status === 'ready') {
    await showMainMenu(ctx, user);
  }
}

// ============================================================
// SCREEN HELPERS
// ============================================================

async function showMainMenu(ctx, user) {
  const copy = getCopy(user, ctx);
  await state.setState(user.telegramId, 'main');
  await ctx.replyWithHTML(copy.mainMenuHint, keyboards.mainMenu(user.language));
}

async function showSettingsMenu(ctx, user) {
  const copy = getCopy(user, ctx);
  await state.setState(user.telegramId, 'settings');
  await ctx.replyWithHTML(copy.settingsMenuHint, keyboards.settingsMenu(user.language));
}

async function showLanguageMenu(ctx, user) {
  const copy = getCopy(user, ctx);
  await state.setState(user.telegramId, 'language');
  await ctx.replyWithHTML(copy.languageMenuHint, keyboards.languageMenu(user.language));
}

async function beginOnboarding(ctx, user) {
  const copy = getCopy(user, ctx);
  await db.updateUser(user.telegramId, { status: 'awaiting_phone' });
  await state.setState(user.telegramId, 'awaiting_phone');
  await ctx.replyWithHTML(copy.askPhone, keyboards.requestPhone(user.language));
}

async function sendSheetsList(ctx, user) {
  const copy = getCopy(user, ctx);
  const sheets = await db.listUserSheets(user.telegramId);
  const groups = await db.listUserGroups(user.telegramId);
  const groupMap = new Map(groups.map((g) => [String(g.id), g]));
  sheets.forEach((s) => {
    if (s.groupId) s.group = groupMap.get(String(s.groupId)) || null;
  });
  await ctx.replyWithHTML(copy.sheetsList(sheets), {
    disable_web_page_preview: true,
    ...keyboards.mainMenu(user.language),
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
  await db.updateUser(user.telegramId, { status: 'awaiting_gmail' });
  await state.setState(user.telegramId, 'gmail_picker');

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
  await db.updateUser(user.telegramId, { status: 'ready' });

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

    await state.setState(user.telegramId, 'verify_sheet', { sheetId: sheet.id });
    await ctx.replyWithHTML(
      copy.sheetCreated(spreadsheetUrl, false),
      keyboards.verifySheetMenu(user.language)
    );
  } catch (err) {
    console.error('[onboarding] sheet creation failed:', err.message);
    await ctx.replyWithHTML(copy.sheetCreateError(err.message));
    await showMainMenu(ctx, user);
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
    await state.setState(user.telegramId, 'verify_sheet', { sheetId: sheet.id });
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
    await state.setState(user.telegramId, 'awaiting_group', { sheetId: sheet.id });
    await ctx.replyWithHTML(
      copy.askGroupNoExisting(sheet.title),
      keyboards.mainMenu(user.language)
    );
    return;
  }

  await state.setState(user.telegramId, 'group_picker', { sheetId: sheet.id });
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
  await showMainMenu(ctx, user);
}

// ============================================================
// helpers
// ============================================================

async function ensureUser(ctx) {
  const upserted = await db.upsertUser({
    telegramId: ctx.from.id,
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    language: ctx.from.language_code,
  });
  const user = await db.getUser(ctx.from.id);
  return { user, isFirstTime: !!upserted.__created };
}

function getCopy(user, ctx) {
  return messages.forLanguage(inferUserLanguage(user, ctx?.from?.language_code));
}

// normalizeLanguage olib tashlandi — endi label keys ('uz'/'ru') bevosita ishlatiladi
void normalizeLanguage;

module.exports = {
  register,
  // groupHandler integration
  getPendingGroupAssign,
  clearPendingGroupAssign,
};
