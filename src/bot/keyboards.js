/**
 * Reply (oddiy) klaviatura tugmalari.
 *
 * Loyihaning qoidasi: ALOHIDA aytilmagunicha — faqat reply keyboard.
 * Inline button ishlatilmaydi. Tugma matni emoji bilan boshlanadi.
 *
 * Tugma matnlari LABELS obyektida saqlanadi (ikki tilda) — text router shu
 * yerda matnni "kalit" ga aylantiradi (label → key).
 */

const { Markup } = require('telegraf');
const { normalizeLanguage } = require('./i18n');

const LABELS = {
  uz: {
    start: '🚀 Boshlash',
    mySheets: '📋 Sheetlarim',
    settings: '⚙️ Sozlamalar',
    newSheet: '🆕 Yangi sheet',
    status: '📊 Holatim',
    help: '❓ Yordam',
    language: '🌐 Til',
    back: '🔙 Orqaga',
    cancel: '❌ Bekor qilish',
    newGmail: '✍️ Yangi gmail',
    newGroup: '➕ Yangi guruh',
    verified: '✅ Ulandim',
    sendPhone: '📱 Raqamni yuborish',
    uz: "🇺🇿 O'zbekcha",
    ru: '🇷🇺 Русский',
  },
  ru: {
    start: '🚀 Начать',
    mySheets: '📋 Мои sheet',
    settings: '⚙️ Настройки',
    newSheet: '🆕 Новый sheet',
    status: '📊 Мой статус',
    help: '❓ Помощь',
    language: '🌐 Язык',
    back: '🔙 Назад',
    cancel: '❌ Отмена',
    newGmail: '✍️ Новый Gmail',
    newGroup: '➕ Новая группа',
    verified: '✅ Подключил',
    sendPhone: '📱 Отправить номер',
    uz: "🇺🇿 O'zbekcha",
    ru: '🇷🇺 Русский',
  },
};

function L(language) {
  return LABELS[normalizeLanguage(language)];
}

/**
 * Asosiy menyu — user "ready" bo'lganida ko'rsatiladi.
 */
function mainMenu(language) {
  const l = L(language);
  return Markup.keyboard([
    [l.mySheets, l.newSheet],
    [l.settings],
  ]).resize();
}

/**
 * /start bosilgan, lekin user hali boshlamagan — bitta katta "🚀 Boshlash".
 */
function startMenu(language) {
  const l = L(language);
  return Markup.keyboard([[l.start]]).resize();
}

/**
 * Sozlamalar menyusi.
 */
function settingsMenu(language) {
  const l = L(language);
  return Markup.keyboard([
    [l.language],
    [l.status, l.help],
    [l.back],
  ]).resize();
}

/**
 * Til tanlash menyusi.
 */
function languageMenu(language) {
  const l = L(language);
  return Markup.keyboard([
    [l.uz, l.ru],
    [l.back],
  ]).resize();
}

/**
 * Telefon raqamini so'rash (contactRequest).
 */
function requestPhone(language) {
  const l = L(language);
  return Markup.keyboard([[Markup.button.contactRequest(l.sendPhone)]])
    .oneTime()
    .resize();
}

/**
 * Gmail picker — eski gmaillar + "Yangi gmail" + Bekor qilish.
 * Tanlangan tugma matni: "📧 user@gmail.com"
 */
function gmailPicker(language, gmails) {
  const l = L(language);
  const rows = gmails.map((email) => [`📧 ${truncate(email, 40)}`]);
  rows.push([l.newGmail]);
  rows.push([l.cancel]);
  return Markup.keyboard(rows).resize();
}

/**
 * Sheet verifikatsiya tugmasi.
 */
function verifySheetMenu(language) {
  const l = L(language);
  return Markup.keyboard([
    [l.verified],
    [l.cancel],
  ]).resize();
}

/**
 * Group picker — sheet uchun guruh tanlash.
 * Tanlangan tugma matni: "💬 Group title"
 */
function groupPicker(language, groups) {
  const l = L(language);
  const rows = groups.map((g) => [`💬 ${truncate(g.title || `ID ${g.id}`, 40)}`]);
  rows.push([l.newGroup]);
  rows.push([l.cancel]);
  return Markup.keyboard(rows).resize();
}

const removeKeyboard = Markup.removeKeyboard();

function truncate(s, max) {
  const str = String(s || '');
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/**
 * Yordamchi: matnga qarab uning "kalit"ini topadi (har ikki tilda ham).
 * Masalan: "📋 Sheetlarim" yoki "📋 Мои sheet" → 'mySheets'.
 */
function matchLabel(text) {
  if (!text) return null;
  for (const lang of ['uz', 'ru']) {
    for (const [key, label] of Object.entries(LABELS[lang])) {
      if (label === text) return key;
    }
  }
  return null;
}

/**
 * Gmail tugmasi tarkibidan emailni ajratib oladi.
 * "📧 user@gmail.com" → "user@gmail.com"
 */
function extractGmailFromButton(text) {
  const m = String(text || '').match(/[\w.+-]+@gmail\.com/i);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Guruh tugmasi tarkibidan group title'ni ajratib oladi.
 * "💬 My Group" → "My Group"
 */
function extractGroupTitleFromButton(text) {
  const s = String(text || '');
  if (!s.startsWith('💬 ')) return null;
  return s.slice(2).trim();
}

module.exports = {
  LABELS,
  L,
  mainMenu,
  startMenu,
  settingsMenu,
  languageMenu,
  requestPhone,
  gmailPicker,
  verifySheetMenu,
  groupPicker,
  removeKeyboard,
  matchLabel,
  extractGmailFromButton,
  extractGroupTitleFromButton,
};
