/**
 * Onboarding va sheet/group management.
 *
 * State machine — `users.status`:
 *   new              -> /start
 *   awaiting_phone   -> contact share kutilmoqda
 *   awaiting_gmail   -> gmail kutilmoqda
 *   ready            -> profile to'liq, sheet/group qo'shishga tayyor
 *
 * Sheet va group bog'lanishi alohida lifecycle'larga ega — user 'ready' bo'lgach
 * istalgan vaqtda yangi sheet qo'sha oladi va guruhini almashtira oladi.
 *
 * Buyruqlar:
 *   /start         - boshlash / status ko'rsatish
 *   /status        - joriy holat
 *   /help          - yordam
 *   /reset         - hamma narsani tozalash
 *   /sheets        - barcha sheetlar ro'yxati
 *   /newsheet      - yangi sheet yaratish
 *   /verify_<id>   - sheetni FB ulanishini tekshirish
 *   /changegroup   - guruhni o'zgartirish (eski guruhdan chiqishga ko'rsatma)
 */

const messages = require('./messages');
const keyboards = require('./keyboards');
const db = require('../db');
const google = require('../google');

const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

function register(bot) {
  // ============================================================
  // /start
  // ============================================================
  bot.start(async (ctx) => {
    const from = ctx.from;
    await db.upsertUser({
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
    });

    const user = await db.getUser(from.id);

    // Profile tugagan bo'lsa darhol status ko'rsatamiz
    if (user.status === 'ready') {
      await sendStatus(ctx, user);
      return;
    }

    await ctx.replyWithHTML(messages.welcome(from.first_name), keyboards.startButton);
  });

  // ============================================================
  // /status
  // ============================================================
  bot.command('status', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user) {
      await ctx.reply('Avval /start bosing');
      return;
    }
    await sendStatus(ctx, user);
  });

  // ============================================================
  // /reset — hamma narsani tozalash (sheets ham CASCADE bilan)
  // ============================================================
  bot.command('reset', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (user) {
      // Sheetlar CASCADE bilan o'chadi (FK ON DELETE CASCADE)
      await db.User.destroy({ where: { telegramId: ctx.from.id } });
    }
    await ctx.replyWithHTML(messages.reset);
  });

  // ============================================================
  // /help
  // ============================================================
  bot.command('help', async (ctx) => {
    await ctx.replyWithHTML(messages.help);
  });

  // ============================================================
  // /sheets — ro'yxat
  // ============================================================
  bot.command('sheets', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user) {
      await ctx.reply('Avval /start bosing');
      return;
    }
    const sheets = await db.listUserSheets(ctx.from.id);
    await ctx.replyWithHTML(messages.sheetsList(sheets), {
      disable_web_page_preview: true,
    });
  });

  // ============================================================
  // /newsheet — yangi sheet yaratish
  // ============================================================
  bot.command('newsheet', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user || user.status !== 'ready' || !user.gmail) {
      await ctx.replyWithHTML(messages.newSheetNotReady);
      return;
    }
    await createAndAttachSheet(ctx, user, /* isFirst */ false);
  });

  // ============================================================
  // /verify_<sheetPk> — text command alternative for verify button
  // ============================================================
  bot.hears(/^\/verify_(\d+)$/, async (ctx) => {
    const sheetPk = ctx.match[1];
    await handleVerifySheet(ctx, sheetPk);
  });

  // ============================================================
  // /changegroup — guruhni o'zgartirish
  // ============================================================
  bot.command('changegroup', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user) {
      await ctx.reply('Avval /start bosing');
      return;
    }
    if (!user.groupId) {
      await ctx.replyWithHTML(messages.changeGroupNoCurrent);
      return;
    }
    await ctx.replyWithHTML(messages.changeGroupInstructions(user.groupId));
  });

  // ============================================================
  // "Boshlash" tugmasi
  // ============================================================
  bot.action('start_onboarding', async (ctx) => {
    await ctx.answerCbQuery();
    await db.updateUser(ctx.from.id, { status: 'awaiting_phone' });
    await ctx.replyWithHTML(messages.askPhone, keyboards.requestPhone);
  });

  // ============================================================
  // Telefon kelganda
  // ============================================================
  bot.on('contact', async (ctx) => {
    const user = await db.getUser(ctx.from.id);
    if (!user || user.status !== 'awaiting_phone') return;

    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from.id) {
      await ctx.reply("Iltimos, o'zingizning raqamingizni yuboring.");
      return;
    }

    await db.updateUser(ctx.from.id, {
      phone: contact.phone_number,
      status: 'awaiting_gmail',
    });

    await ctx.replyWithHTML(messages.phoneSaved(contact.phone_number), keyboards.removeKeyboard);
    await ctx.replyWithHTML(messages.askGmail);
  });

  // ============================================================
  // Gmail kelganda (matn) — barcha komandalar tashqarida bo'lishi kerak
  // ============================================================
  bot.on('text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return next();

    const user = await db.getUser(ctx.from.id);
    if (!user) return;

    if (user.status === 'awaiting_gmail') {
      if (!GMAIL_REGEX.test(text)) {
        await ctx.replyWithHTML(messages.invalidGmail);
        return;
      }

      // Gmail saqlaymiz va profile'ni 'ready' qilamiz
      await db.updateUser(ctx.from.id, {
        gmail: text,
        status: 'ready',
      });

      // Birinchi sheet'ni avtomatik yaratamiz
      const updatedUser = await db.getUser(ctx.from.id);
      await createAndAttachSheet(ctx, updatedUser, /* isFirst */ true);
      return;
    }

    return next();
  });

  // ============================================================
  // "✅ Ulandim" tugmasi (verify_sheet:<sheetPk>)
  // ============================================================
  bot.action(/^verify_sheet:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const sheetPk = ctx.match[1];
    await handleVerifySheet(ctx, sheetPk);
  });

  // ============================================================
  // Qayta boshlash tugmasi (legacy)
  // ============================================================
  bot.action('restart', async (ctx) => {
    await ctx.answerCbQuery();
    await db.User.destroy({ where: { telegramId: ctx.from.id } });
    await ctx.replyWithHTML(messages.welcome(ctx.from.first_name), keyboards.startButton);
  });
}

// ============================================================
// Helpers
// ============================================================

async function sendStatus(ctx, user) {
  const sheets = await db.listUserSheets(user.telegramId);
  const isActive = await db.isUserActive(user.telegramId);
  await ctx.replyWithHTML(messages.status({ user, sheets, isActive }));
}

/**
 * Yangi Google Sheet yaratadi, DB ga yozadi va verify tugmasi bilan
 * foydalanuvchiga FB ulanish ko'rsatmalarini yuboradi.
 */
async function createAndAttachSheet(ctx, user, isFirst) {
  await ctx.replyWithHTML(isFirst ? messages.creatingSheet : messages.newSheetCreating);

  try {
    const title = `Lead Bridge — ${user.firstName || user.telegramId} — ${new Date().toISOString().slice(0, 10)}`;
    const { sheetId: spreadsheetId, sheetUrl: spreadsheetUrl } = await google.createSheetForUser({
      title,
      userEmail: user.gmail,
    });

    const sheet = await db.createSheet({
      userTelegramId: user.telegramId,
      spreadsheetId,
      spreadsheetUrl,
      title,
    });

    await ctx.replyWithHTML(
      messages.sheetCreated(spreadsheetUrl, isFirst),
      keyboards.verifySheetButton(sheet.id)
    );
  } catch (err) {
    console.error('[onboarding] sheet creation failed:', err.message);
    await ctx.replyWithHTML(
      `❌ Sheet yaratishda xatolik: <code>${escapeHtml(err.message)}</code>\n\nQaytadan urining: /newsheet`
    );
  }
}

/**
 * Sheet'ni FB Lead Center ulanishi uchun verifikatsiya qiladi.
 * Idempotent — allaqachon verified bo'lsa, qayta tekshirmaymiz.
 */
async function handleVerifySheet(ctx, sheetPk) {
  const sheet = await db.getSheet(sheetPk);
  if (!sheet || String(sheet.userTelegramId) !== String(ctx.from.id)) {
    await ctx.replyWithHTML(messages.sheetNotFound);
    return;
  }

  // Idempotent: allaqachon verified
  if (sheet.status === 'verified') {
    const user = await db.getUser(ctx.from.id);
    await ctx.replyWithHTML(messages.sheetVerifiedSuccess(!user.groupId));
    return;
  }

  await ctx.replyWithHTML(messages.verifying);
  const result = await google.verifyFacebookConnection(sheet.spreadsheetId);

  if (!result.verified) {
    await db.updateSheet(sheetPk, {
      status: 'pending_verification',
      errorReason: null,
    });
    await ctx.replyWithHTML(
      messages.sheetVerifyFail(result.missing),
      keyboards.verifySheetButton(sheetPk)
    );
    return;
  }

  await db.updateSheet(sheetPk, {
    status: 'verified',
    errorReason: null,
  });

  const user = await db.getUser(ctx.from.id);
  await ctx.replyWithHTML(messages.sheetVerifiedSuccess(!user.groupId));
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { register };
