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
    newGroup: '➕ Yangi guruh',
    verified: '✅ Ulandim',
    sendPhone: '📱 Raqamni yuborish',
    confirmYes: '✅ Ha, o\'chirish',
    confirmNo: '🔙 Yo\'q, qaytish',
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
    newGroup: '➕ Новая группа',
    verified: '✅ Подключил',
    confirmYes: '✅ Да, удалить',
    confirmNo: '🔙 Нет, назад',
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
 * Gmail picker — eski gmaillar + Bekor qilish.
 * Yangi gmail uchun alohida tugma yo'q: user inputga to'g'ridan-to'g'ri yozadi.
 * Tanlangan tugma matni: "📧 user@gmail.com"
 */
function gmailPicker(language, gmails) {
  const l = L(language);
  const rows = gmails.map((email) => [`📧 ${truncate(email, 40)}`]);
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
 * Sheets ro'yxati ekranida ko'rsatiladigan keyboard — har sheet uchun
 * "🗑 #N" o'chirish tugmasi va orqaga qaytish.
 */
function sheetsListMenu(language, sheets) {
  const l = L(language);
  const rows = [];
  // Tugmalarni 2 tadan ustunda joylashtiramiz
  for (let i = 0; i < sheets.length; i += 2) {
    const row = [`🗑 #${i + 1}`];
    if (sheets[i + 1]) row.push(`🗑 #${i + 2}`);
    rows.push(row);
  }
  rows.push([l.back]);
  return Markup.keyboard(rows).resize();
}

/**
 * Sheet o'chirishni tasdiqlash keyboardi.
 */
function confirmDeleteMenu(language) {
  const l = L(language);
  return Markup.keyboard([
    [l.confirmYes],
    [l.confirmNo],
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
  sheetsListMenu,
  confirmDeleteMenu,
  groupPicker,
  removeKeyboard,
  matchLabel,
  extractGmailFromButton,
  extractGroupTitleFromButton,
};
