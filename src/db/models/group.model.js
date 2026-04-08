/**
 * Group — Telegram guruh (chat) bot ulangan.
 *
 * Bitta group bitta userga tegishli (owner). Bitta user N ta group ulashi
 * mumkin (har sheet uchun alohida yoki bir nechta sheet bitta groupda).
 *
 * `id` — Telegram chat_id (BIGINT, manuel beriladi, autoIncrement emas).
 * `botIsAdmin` — bot shu groupda admin bo'lganmi? Poller faqat true bo'lganlarga
 *  lead jo'natadi.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Group = sequelize.define(
    'Group',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        allowNull: false,
      },
      ownerTelegramId: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      botIsAdmin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: 'groups',
      indexes: [{ fields: ['owner_telegram_id'] }],
    }
  );

  return Group;
};
