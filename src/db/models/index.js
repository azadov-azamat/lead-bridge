/**
 * Model registry — barcha modellar va ularning bog'lanishlari.
 *
 * Foydalanish:
 *   const { sequelize, User, Sheet, Group, SentLead } = require('./db/models');
 */

const sequelize = require('../sequelize');
const defineUser = require('./user.model');
const defineSheet = require('./sheet.model');
const defineGroup = require('./group.model');
const defineSentLead = require('./sentLead.model');

const User = defineUser(sequelize);
const Sheet = defineSheet(sequelize);
const Group = defineGroup(sequelize);
const SentLead = defineSentLead(sequelize);

// --- Associations ---

// User 1—N Sheet (CASCADE)
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

// User 1—N Group (CASCADE)
User.hasMany(Group, {
  foreignKey: 'ownerTelegramId',
  sourceKey: 'telegramId',
  as: 'groups',
  onDelete: 'CASCADE',
});
Group.belongsTo(User, {
  foreignKey: 'ownerTelegramId',
  targetKey: 'telegramId',
  as: 'owner',
});

// Group 1—N Sheet (SET NULL: group o'chsa, sheetlar group_id ni yo'qotadi)
Group.hasMany(Sheet, {
  foreignKey: 'groupId',
  sourceKey: 'id',
  as: 'sheets',
  onDelete: 'SET NULL',
});
Sheet.belongsTo(Group, {
  foreignKey: 'groupId',
  targetKey: 'id',
  as: 'group',
});

// Sheet 1—N SentLead (CASCADE)
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
  Group,
  SentLead,
};
