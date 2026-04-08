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

module.exports = bot;
