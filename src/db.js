/**
 * DB facade — Sequelize modellariga oddiy domen-funksiyalar.
 *
 * Konvensiya: barcha funksiyalar **async**, qaytariladigan obyektlar
 * **camelCase** (Sequelize underscored mapping orqali avtomatik).
 *
 * Bu qatlam caller'lar uchun "thin layer" — Sequelize internal'larini
 * qulflab, oddiy CRUD'ni eksport qiladi. Murakkab so'rovlar uchun caller
 * to'g'ridan-to'g'ri modeldan foydalanishi mumkin (`const { Sheet } = require('./db');`).
 */

const { Op } = require('sequelize');
const { sequelize, User, Sheet, SentLead } = require('./db/models');
const redis = require('./redis');

// ============================================================
// USER queries
// ============================================================

/**
 * Yangi user yaratadi yoki mavjud bo'lsa profile'ni yangilaydi.
 * Status'ga TEGMAYDI (faqat birinchi marta 'new' bo'ladi).
 */
async function upsertUser({ telegramId, username, firstName }) {
  const [user, created] = await User.findOrCreate({
    where: { telegramId },
    defaults: {
      telegramId,
      username: username || null,
      firstName: firstName || null,
      status: 'new',
    },
  });

  if (!created) {
    const updates = {};
    if (username && user.username !== username) updates.username = username;
    if (firstName && user.firstName !== firstName) updates.firstName = firstName;
    if (Object.keys(updates).length > 0) {
      await user.update(updates);
    }
  }

  return user.toJSON();
}

async function getUser(telegramId) {
  const user = await User.findByPk(telegramId);
  return user ? user.toJSON() : null;
}

async function updateUser(telegramId, fields) {
  if (!fields || Object.keys(fields).length === 0) return;
  await User.update(fields, { where: { telegramId } });
}

/**
 * Bitta guruh ID si bo'yicha userni topadi (bot guruhdan chiqarilganda kerak).
 */
async function getUserByGroupId(groupId) {
  const user = await User.findOne({ where: { groupId } });
  return user ? user.toJSON() : null;
}

// ============================================================
// SHEET queries
// ============================================================

async function createSheet({ userTelegramId, spreadsheetId, spreadsheetUrl, title }) {
  const sheet = await Sheet.create({
    userTelegramId,
    spreadsheetId,
    spreadsheetUrl,
    title: title || null,
    status: 'pending_verification',
  });
  return sheet.toJSON();
}

async function getSheet(sheetPk) {
  const sheet = await Sheet.findByPk(sheetPk);
  return sheet ? sheet.toJSON() : null;
}

async function updateSheet(sheetPk, fields) {
  if (!fields || Object.keys(fields).length === 0) return;
  await Sheet.update(fields, { where: { id: sheetPk } });
}

async function deleteSheet(sheetPk) {
  await Sheet.destroy({ where: { id: sheetPk } });
}

/**
 * User'ning barcha sheetlari (yangidan eskiga).
 */
async function listUserSheets(userTelegramId) {
  const sheets = await Sheet.findAll({
    where: { userTelegramId },
    order: [['createdAt', 'DESC']],
  });
  return sheets.map((s) => s.toJSON());
}

/**
 * User'ning verified sheetlari soni (state'ni computed qilish uchun).
 */
async function countVerifiedSheets(userTelegramId) {
  return Sheet.count({
    where: { userTelegramId, status: 'verified' },
  });
}

/**
 * Poller uchun: barcha verified sheetlar, ularning egasi guruhga ulangan
 * VA bot guruhda admin huquqiga ega.
 *
 * `bot_is_admin=true` shartini qo'shamiz: bot admin bo'lmagan guruhlarga
 * lead jo'natmaymiz (foydalanuvchi avval admin qilishi kerak).
 */
async function getSheetsForPolling() {
  const sheets = await Sheet.findAll({
    where: { status: 'verified' },
    include: [
      {
        model: User,
        as: 'user',
        required: true,
        where: {
          status: 'ready',
          groupId: { [Op.ne]: null },
          botIsAdmin: true,
        },
      },
    ],
  });
  return sheets.map((s) => s.toJSON());
}

/**
 * Bot admin BO'LMAGAN userlar uchun: verified sheetlar bilan birga.
 * Poller "you have leads but bot is not admin" alert mantig'i uchun.
 */
async function getSheetsAwaitingAdmin() {
  const sheets = await Sheet.findAll({
    where: { status: 'verified' },
    include: [
      {
        model: User,
        as: 'user',
        required: true,
        where: {
          status: 'ready',
          groupId: { [Op.ne]: null },
          botIsAdmin: false,
        },
      },
    ],
  });
  return sheets.map((s) => s.toJSON());
}

// ============================================================
// NOT-ADMIN ALERT throttle (Redis)
// ============================================================
//
// Bot admin emas, lekin yangi leadlar kelmoqda. User'ni cheksiz spam'lamaslik
// uchun har userga `notAdminAlertTtlMs` (default 4 soat) ichida bittadan
// ko'p alert yubormaymiz. Redis SET NX EX orqali atomic.

const NOT_ADMIN_ALERT_KEY = (telegramId) => `alert:not_admin:${telegramId}`;
const DEFAULT_ALERT_TTL_MS = 4 * 60 * 60 * 1000; // 4 soat

/**
 * Alert yuborishga ruxsat bermi? Lock olsa true, aks holda false.
 * TTL o'tgach yana ruxsat beriladi.
 */
async function tryClaimNotAdminAlert(telegramId, ttlMs = DEFAULT_ALERT_TTL_MS) {
  const result = await redis.redis.set(
    NOT_ADMIN_ALERT_KEY(telegramId),
    String(Date.now()),
    'PX',
    ttlMs,
    'NX'
  );
  return result === 'OK';
}

/**
 * User admin qilingach lock'ni darhol tozalaymiz — keyingi marta
 * (agar yana demote qilinsa) alert ishlay olsin.
 */
async function clearNotAdminAlert(telegramId) {
  await redis.redis.del(NOT_ADMIN_ALERT_KEY(telegramId));
}

// ============================================================
// SENT_LEADS queries
// ============================================================

/**
 * Belgilangan sheet uchun yuborilgan barcha lead ID'lari (Set sifatida).
 */
async function getSentLeadIds(sheetPk) {
  const rows = await SentLead.findAll({
    where: { sheetId: sheetPk },
    attributes: ['leadId'],
    raw: true,
  });
  return new Set(rows.map((r) => r.leadId));
}

async function markLeadSent(sheetPk, leadId) {
  await SentLead.findOrCreate({
    where: { sheetId: sheetPk, leadId },
    defaults: { sheetId: sheetPk, leadId },
  });
}

// ============================================================
// COMPUTED helpers
// ============================================================

/**
 * User to'liq aktivmi? (UI status uchun)
 *   ready + groupId + ≥1 verified sheet
 */
async function isUserActive(telegramId) {
  const user = await getUser(telegramId);
  if (!user || user.status !== 'ready' || !user.groupId) return false;
  const verifiedCount = await countVerifiedSheets(telegramId);
  return verifiedCount > 0;
}

module.exports = {
  // Sequelize raw
  sequelize,
  User,
  Sheet,
  SentLead,

  // User
  upsertUser,
  getUser,
  updateUser,
  getUserByGroupId,

  // Sheet
  createSheet,
  getSheet,
  updateSheet,
  deleteSheet,
  listUserSheets,
  countVerifiedSheets,
  getSheetsForPolling,
  getSheetsAwaitingAdmin,

  // SentLead
  getSentLeadIds,
  markLeadSent,

  // Not-admin alert throttle
  tryClaimNotAdminAlert,
  clearNotAdminAlert,

  // Computed
  isUserActive,
};
