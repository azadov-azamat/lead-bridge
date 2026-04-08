/**
 * SentLead — dedup. Composite primary key (sheetId, leadId).
 *
 * sheetId — sheets.id ga FK (internal BIGINT, Google'ning spreadsheetId emas).
 * leadId  — Facebook tomonidan generate qilingan unique lead ID (sheet'da 'id' ustuni).
 *
 * Sheet o'chirilsa CASCADE bilan birga ketadi.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SentLead = sequelize.define(
    'SentLead',
    {
      sheetId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true,
      },
      leadId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        primaryKey: true,
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'sent_leads',
      timestamps: false,
      indexes: [{ fields: ['sheet_id'] }],
    }
  );

  return SentLead;
};
