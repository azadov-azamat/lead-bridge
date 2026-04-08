/**
 * Sheet — bitta Google Spreadsheet ulashi.
 *
 * Bitta user N ta sheet ulashi mumkin (har Facebook lead form uchun alohida).
 *
 * spreadsheetId — Google Sheets API "spreadsheetId" (alfaqo'mli string).
 * UNIQUE — bitta Google sheet faqat bitta userga ulanishi mumkin.
 *
 * Lifecycle:
 *   pending_verification  -> yaratildi, FB ulanishi kutilmoqda
 *   verified              -> FB Lead Center ustunlari topildi, poller o'qiyapti
 *   error                 -> verifikatsiya yoki polling jarayonida xato
 */

const { DataTypes } = require('sequelize');

const SHEET_STATUSES = ['pending_verification', 'verified', 'error'];

module.exports = (sequelize) => {
  const Sheet = sequelize.define(
    'Sheet',
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      userTelegramId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      spreadsheetId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      spreadsheetUrl: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      gmail: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      groupId: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(...SHEET_STATUSES),
        allowNull: false,
        defaultValue: 'pending_verification',
      },
      lastPolledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      errorReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'sheets',
      indexes: [
        { fields: ['user_telegram_id'] },
        { fields: ['status'] },
        { fields: ['group_id'] },
        { fields: ['is_deleted'] },
      ],
    }
  );

  Sheet.STATUSES = SHEET_STATUSES;
  return Sheet;
};

module.exports.STATUSES = SHEET_STATUSES;
