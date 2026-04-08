/**
 * Model registry — barcha modellar va ularning bog'lanishlari.
 *
 * Foydalanish:
 *   const { sequelize, User, Sheet, SentLead } = require('./db/models');
 */

const sequelize = require('../sequelize');
const defineUser = require('./user.model');
const defineSheet = require('./sheet.model');
const defineSentLead = require('./sentLead.model');

const User = defineUser(sequelize);
const Sheet = defineSheet(sequelize);
const SentLead = defineSentLead(sequelize);

// --- Associations ---

// User 1—N Sheet (CASCADE: user o'chsa sheetlari ham)
User.hasMany(Sheet, {
  foreignKey: 'userTelegramId',
  sourceKey: 'telegramId',
  as: 'sheets',
  onDelete: 'CASCADE',
});
Sheet.belongsTo(User, {
  foreignKey: 'userTelegramId',
  targetKey: 'telegramId',
  as: 'user',
});

// Sheet 1—N SentLead (CASCADE: sheet o'chsa send tarixi ham)
Sheet.hasMany(SentLead, {
  foreignKey: 'sheetId',
  sourceKey: 'id',
  as: 'sentLeads',
  onDelete: 'CASCADE',
});
SentLead.belongsTo(Sheet, {
  foreignKey: 'sheetId',
  targetKey: 'id',
  as: 'sheet',
});

module.exports = {
  sequelize,
  User,
  Sheet,
  SentLead,
};
