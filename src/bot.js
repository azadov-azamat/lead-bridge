/**
 * Telegraf bot instance — yagona joy. Boshqa modullar (app.js, index.js)
 * shu yerdan import qiladi.
 *
 * Handler'lar bu yerda ro'yxatdan o'tkaziladi (onboarding, group). Bot
 * "ishga tushirish" (launch / setWebhook) `index.js` bootstrap'ida bajariladi.
 *
 * `__launched` flag — hot reloader'lar (`node --watch`) tomonidan ikki marta
 * launch qilinishidan himoya. `bin/www` reference'idan olingan pattern.
 */

const { Telegraf } = require('telegraf');
const config = require('./config');
const onboarding = require('./bot/onboarding');
const groupHandler = require('./bot/groupHandler');
const storyMentionHandler = require('./bot/storyMentionHandler');
const messages = require('./bot/messages');
const { inferUserLanguage } = require('./bot/i18n');
const { auth } = require('./bot/auth');
const db = require('./db');

const bot = new Telegraf(config.telegramBotToken);

// Auth middleware — birinchi navbatda. ctx.user, ctx.session, ctx.copy,
// ctx.isFirstTime ni o'rnatadi va eski user.status qoldiqlarini normallashtiradi.
bot.use(auth);

// Handler ro'yxati
storyMentionHandler.register(bot);
onboarding.register(bot);
groupHandler.register(bot);

// Global xato handler — texnik xatoni log qilamiz, foydalanuvchiga esa
// faqat umumiy "xatolik bo'ldi" xabari yuboriladi (texnik tafsilotlarsiz).
bot.catch(async (err, ctx) => {
  console.error(`[bot] xato (update ${ctx.update.update_id}):`, err);
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    let language;
    try {
      const user = await db.getUser(telegramId);
      language = inferUserLanguage(user, ctx.from?.language_code);
    } catch (_) {
      language = inferUserLanguage(null, ctx.from?.language_code);
    }
    const copy = messages.forLanguage(language);
    await ctx.reply(copy.errorGeneric);
  } catch (notifyErr) {
    console.error('[bot] foydalanuvchini xabardor qilib bo\'lmadi:', notifyErr.message);
  }
});

// Hot reloader'lar uchun guard
bot.__launched = false;

// ============================================================
// Bot menyu komandalari (Telegram "/" tugmasi)
// ============================================================
//
// Telegram'ning native command menu'siga ko'rinadigan komandalar.
// Faqat private chat scope'ida — guruhlarda menyu chiqmaydi (chunki
// userlar bot bilan faqat DM da ishlaydi).
//
// `/verify_<id>` dynamic command — menyuda yo'q (ad-hoc).
const COMMAND_MENU = {
  uz: [
    { command: 'start', description: 'Botni ochish va boshlash' },
    { command: 'newsheet', description: 'Yangi sheet yaratish' },
    { command: 'changegroup', description: 'Guruhni almashtirish' },
    { command: 'help', description: 'Yordam olish' },
  ],
  ru: [
    { command: 'start', description: 'Открыть бота и начать' },
    { command: 'newsheet', description: 'Создать новый sheet' },
    { command: 'changegroup', description: 'Сменить группу' },
    { command: 'help', description: 'Получить помощь' },
  ],
};

/**
 * Bot menyusini Telegram'ga register qiladi. Idempotent — har boot'da
 * chaqirsa bo'ladi (Telegram setMyCommands ni o'zi cache qiladi).
 */
async function setupCommandMenu() {
  await bot.telegram.setMyCommands(COMMAND_MENU.uz);
  await bot.telegram.setMyCommands(COMMAND_MENU.uz, {
    scope: { type: 'all_private_chats' },
  });
  await bot.telegram.setMyCommands(COMMAND_MENU.uz, {
    scope: { type: 'all_private_chats' },
    language_code: 'uz',
  });
  await bot.telegram.setMyCommands(COMMAND_MENU.ru, {
    scope: { type: 'all_private_chats' },
    language_code: 'ru',
  });
  console.log(`[bot] command menu set (${COMMAND_MENU.uz.length} ta buyruq)`);
}
bot.setupCommandMenu = setupCommandMenu;

module.exports = bot;
