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

const bot = new Telegraf(config.telegramBotToken);

// Handler ro'yxati
onboarding.register(bot);
groupHandler.register(bot);

// Global xato handler
bot.catch((err, ctx) => {
  console.error(`[bot] xato (update ${ctx.update.update_id}):`, err);
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
const COMMAND_MENU = [
  { command: 'start', description: "Sozlashni boshlash / holatni ko'rish" },
  { command: 'status', description: 'Joriy holat' },
  { command: 'sheets', description: "Barcha Google sheetlarim" },
  { command: 'newsheet', description: 'Yangi Google Sheet yaratish' },
  { command: 'changegroup', description: "Telegram guruhini o'zgartirish" },
  { command: 'reset', description: "Hamma narsani qayta boshlash" },
  { command: 'help', description: 'Yordam va buyruqlar' },
];

/**
 * Bot menyusini Telegram'ga register qiladi. Idempotent — har boot'da
 * chaqirsa bo'ladi (Telegram setMyCommands ni o'zi cache qiladi).
 */
async function setupCommandMenu() {
  // 1. Default scope (har holatda fallback)
  await bot.telegram.setMyCommands(COMMAND_MENU);
  // 2. Private chats — bot DM da ishlaydi, asosiy scope shu
  await bot.telegram.setMyCommands(COMMAND_MENU, {
    scope: { type: 'all_private_chats' },
  });
  console.log(`[bot] command menu set (${COMMAND_MENU.length} ta buyruq)`);
}

bot.setupCommandMenu = setupCommandMenu;

module.exports = bot;
