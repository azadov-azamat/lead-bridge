/**
 * User — Telegram foydalanuvchisi.
 *
 * Konvensiya: JS attribute'lari camelCase, DB ustunlari snake_case.
 * Sequelize `underscored: true` orqali avtomatik mapping qiladi
 * (sequelize.js da global default berilgan).
 *
 * Status enum (faqat profile bosqichlari):
 *   new              -> /start bosildi
 *   awaiting_phone   -> contact share kutilmoqda
 *   awaiting_gmail   -> gmail kutilmoqda
 *   ready            -> profile to'liq, sheet/group qo'shishga tayyor
 *
 * "active"/"done" holati bu yerda yo'q — u computed (isActive helper):
 *   status === 'ready' && groupId !== null && hasVerifiedSheet
 */

const { DataTypes } = require('sequelize');

const STATUSES = ['new', 'awaiting_phone', 'awaiting_gmail', 'ready'];

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
    {
      telegramId: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      firstName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      gmail: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      groupId: {
        type: DataTypes.BIGINT,
        allowNull: true,
        unique: true,
      },
      botIsAdmin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'new',
      },
    },
    {
      tableName: 'users',
      indexes: [{ fields: ['status'] }],
    }
  );

  User.STATUSES = STATUSES;
  return User;
};

module.exports.STATUSES = STATUSES;
