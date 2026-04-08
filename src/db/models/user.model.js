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
 *   awaiting_gmail   -> (legacy) — endi ishlatilmaydi, eski rowlar uchun saqlandi
 *   ready            -> profile to'liq, sheet/group qo'shishga tayyor
 *
 * Gmail va Telegram guruh endi user darajasida emas — Sheet (va Group) modellarida.
 * Bitta user N ta sheet va N ta guruhga ega bo'lishi mumkin.
 */

const { DataTypes } = require('sequelize');

const STATUSES = ['new', 'awaiting_phone', 'awaiting_gmail', 'ready'];
const LANGUAGES = ['uz', 'ru'];

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
      language: {
        type: DataTypes.ENUM(...LANGUAGES),
        allowNull: false,
        defaultValue: 'uz',
      },
      mentionCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      phone: {
        type: DataTypes.STRING(64),
        allowNull: true,
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
  User.LANGUAGES = LANGUAGES;
  return User;
};

module.exports.STATUSES = STATUSES;
module.exports.LANGUAGES = LANGUAGES;
