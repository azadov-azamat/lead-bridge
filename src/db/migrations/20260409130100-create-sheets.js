'use strict';

/**
 * sheets — bitta user N ta Google Sheet ulashi mumkin.
 *
 * Har sheet o'z lifecycle ga ega:
 *   pending_verification -> verified -> error?
 *
 * spreadsheet_id — Google Sheets API "spreadsheetId" (alfaqo'mli string).
 * UNIQUE — bitta Google Sheet faqat bitta userga ulanishi mumkin.
 *
 * last_polled_at — debug/UX uchun (oxirgi marta poller o'qigan vaqt).
 * error_reason  — verifikatsiya yoki polling xato sababi.
 */

const SHEET_STATUSES = ['pending_verification', 'verified', 'error'];

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    await queryInterface.createTable('sheets', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      user_telegram_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'users',
          key: 'telegram_id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      spreadsheet_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      spreadsheet_url: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM(...SHEET_STATUSES),
        allowNull: false,
        defaultValue: 'pending_verification',
      },
      last_polled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      error_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('sheets', ['user_telegram_id'], {
      name: 'sheets_user_telegram_id_idx',
    });
    await queryInterface.addIndex('sheets', ['status'], {
      name: 'sheets_status_idx',
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.dropTable('sheets');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sheets_status";');
  },
};
