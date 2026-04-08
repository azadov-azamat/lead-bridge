'use strict';

/**
 * sent_leads — dedup. Composite PK (sheet_id, lead_id).
 *
 * sheet_id — sheets.id ga FK (internal BIGINT, Google'ning spreadsheet_id emas).
 * lead_id  — sheet'dagi 'id' ustunidan (Facebook lead ID).
 *
 * ON DELETE CASCADE — sheet o'chirilsa, uning send tarixi ham tozalanadi.
 */

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    await queryInterface.createTable('sent_leads', {
      sheet_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'sheets',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      lead_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        primaryKey: true,
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('sent_leads', ['sheet_id'], {
      name: 'sent_leads_sheet_id_idx',
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.dropTable('sent_leads');
  },
};
