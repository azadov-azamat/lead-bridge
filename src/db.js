/**
 * DB facade — Sequelize modellariga oddiy domen-funksiyalar.
 *
 * Konvensiya: barcha funksiyalar **async**, qaytariladigan obyektlar
 * **camelCase** (Sequelize underscored mapping orqali avtomatik).
 */

const { Op, fn, col } = require('sequelize');
const { sequelize, User, Sheet, Group, SentLead } = require('./db/models');
const redis = require('./redis');
const { normalizeLanguage } = require('./bot/i18n');

// ============================================================
// USER queries
// ============================================================

async function upsertUser({ telegramId, username, firstName, language }) {
  const normalizedLanguage = normalizeLanguage(language);
  const [user, created] = await User.findOrCreate({
    where: { telegramId },
    defaults: {
      telegramId,
      username: username || null,
      firstName: firstName || null,
      language: normalizedLanguage,
      status: 'new',
    },
  });

  if (!created) {
    const updates = {};
    if (username && user.username !== username) updates.username = username;
    if (firstName && user.firstName !== firstName) updates.firstName = firstName;
    if (!user.language) updates.language = normalizedLanguage;
    if (Object.keys(updates).length > 0) {
      await user.update(updates);
    }
  }

  return { ...user.toJSON(), __created: created };
}

async function getUser(telegramId) {
  const user = await User.findByPk(telegramId);
  return user ? user.toJSON() : null;
}

async function updateUser(telegramId, fields) {
  if (!fields || Object.keys(fields).length === 0) return;
  await User.update(fields, { where: { telegramId } });
}

async function incrementMentionCount(telegramId) {
  const user = await User.findByPk(telegramId);
  if (!user) return 0;
  await user.increment('mentionCount', { by: 1 });
  await user.reload();
  return Number(user.mentionCount || 0);
}

// ============================================================
// GROUP queries
// ============================================================

async function getGroup(groupId) {
  const group = await Group.findByPk(groupId);
  return group ? group.toJSON() : null;
}

async function upsertGroup({ id, ownerTelegramId, title, botIsAdmin }) {
  const [group, created] = await Group.findOrCreate({
    where: { id },
    defaults: {
      id,
      ownerTelegramId,
      title: title || null,
      botIsAdmin: !!botIsAdmin,
    },
  });
  if (!created) {
    const updates = {};
    if (title && group.title !== title) updates.title = title;
    if (typeof botIsAdmin === 'boolean' && group.botIsAdmin !== botIsAdmin) {
      updates.botIsAdmin = botIsAdmin;
    }
    if (Object.keys(updates).length > 0) await group.update(updates);
  }
  return group.toJSON();
}

async function updateGroup(groupId, fields) {
  if (!fields || Object.keys(fields).length === 0) return;
  await Group.update(fields, { where: { id: groupId } });
}

async function deleteGroup(groupId) {
  await Group.destroy({ where: { id: groupId } });
}

async function listUserGroups(ownerTelegramId) {
  const groups = await Group.findAll({
    where: { ownerTelegramId },
    order: [['createdAt', 'DESC']],
  });
  return groups.map((g) => g.toJSON());
}

// ============================================================
// SHEET queries
// ============================================================

async function createSheet({ userTelegramId, spreadsheetId, spreadsheetUrl, title, gmail }) {
  const sheet = await Sheet.create({
    userTelegramId,
    spreadsheetId,
    spreadsheetUrl,
    title: title || null,
    gmail: gmail || null,
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

async function listUserSheets(userTelegramId) {
  const sheets = await Sheet.findAll({
    where: { userTelegramId },
    order: [['createdAt', 'DESC']],
  });
  return sheets.map((s) => s.toJSON());
}

async function countVerifiedSheets(userTelegramId) {
  return Sheet.count({
    where: { userTelegramId, status: 'verified' },
  });
}

/**
 * Userning oldin ishlatgan gmail akkountlari (distinct, eng so'nggi avval).
 * Picker uchun.
 */
async function listUserGmails(userTelegramId) {
  const rows = await Sheet.findAll({
    where: {
      userTelegramId,
      gmail: { [Op.ne]: null },
    },
    attributes: [
      'gmail',
      [fn('MAX', col('created_at')), 'lastUsed'],
    ],
    group: ['gmail'],
    order: [[fn('MAX', col('created_at')), 'DESC']],
    raw: true,
  });
  return rows.map((r) => r.gmail).filter(Boolean);
}

/**
 * Poller uchun: barcha verified sheetlar, sheet o'z guruhiga bog'langan
 * va shu guruhda bot admin huquqiga ega.
 */
async function getSheetsForPolling() {
  const sheets = await Sheet.findAll({
    where: {
      status: 'verified',
      groupId: { [Op.ne]: null },
    },
    include: [
      {
        model: User,
        as: 'user',
        required: true,
        where: { status: 'ready' },
      },
      {
        model: Group,
        as: 'group',
        required: true,
        where: { botIsAdmin: true },
      },
    ],
  });
  return sheets.map((s) => s.toJSON());
}

/**
 * Verified sheetlar, guruh tayinlangan, lekin bot admin emas — alert mantig'i uchun.
 */
async function getSheetsAwaitingAdmin() {
  const sheets = await Sheet.findAll({
    where: {
      status: 'verified',
      groupId: { [Op.ne]: null },
    },
    include: [
      {
        model: User,
        as: 'user',
        required: true,
        where: { status: 'ready' },
      },
      {
        model: Group,
        as: 'group',
        required: true,
        where: { botIsAdmin: false },
      },
    ],
  });
  return sheets.map((s) => s.toJSON());
}

// ============================================================
// NOT-ADMIN ALERT throttle (Redis)
// ============================================================
//
// Bot admin emas, lekin yangi leadlar kelmoqda. Userni cheksiz spam qilmaslik
// uchun har guruh uchun `notAdminAlertTtlMs` (default 4 soat) ichida bittadan
// ko'p alert yubormaymiz.

const NOT_ADMIN_ALERT_KEY = (groupId) => `alert:not_admin:${groupId}`;
const DEFAULT_ALERT_TTL_MS = 4 * 60 * 60 * 1000; // 4 soat

async function tryClaimNotAdminAlert(groupId, ttlMs = DEFAULT_ALERT_TTL_MS) {
  const result = await redis.redis.set(
    NOT_ADMIN_ALERT_KEY(groupId),
    String(Date.now()),
    'PX',
    ttlMs,
    'NX'
  );
  return result === 'OK';
}

async function clearNotAdminAlert(groupId) {
  await redis.redis.del(NOT_ADMIN_ALERT_KEY(groupId));
}

// ============================================================
// SENT_LEADS queries
// ============================================================

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
 * User aktivmi? (UI status uchun)
 *   ready + ≥1 verified sheet + shu sheetlardan kamida bittasi guruhga bog'langan
 */
async function isUserActive(telegramId) {
  const user = await getUser(telegramId);
  if (!user || user.status !== 'ready') return false;
  const count = await Sheet.count({
    where: {
      userTelegramId: telegramId,
      status: 'verified',
      groupId: { [Op.ne]: null },
    },
  });
  return count > 0;
}

module.exports = {
  // Sequelize raw
  sequelize,
  User,
  Sheet,
  Group,
  SentLead,

  // User
  upsertUser,
  getUser,
  updateUser,
  incrementMentionCount,

  // Group
  getGroup,
  upsertGroup,
  updateGroup,
  deleteGroup,
  listUserGroups,

  // Sheet
  createSheet,
  getSheet,
  updateSheet,
  deleteSheet,
  listUserSheets,
  listUserGmails,
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
