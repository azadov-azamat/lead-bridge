'use strict';

/**
 * users — foydalanuvchi profili va guruh bog'lanishi.
 *
 * Status enum (sodda, faqat onboarding bosqichlari):
 *   new              -> /start
 *   awaiting_phone   -> contact share kutilmoqda
 *   awaiting_gmail   -> gmail kutilmoqda
 *   ready            -> profile to'liq, sheet/group qo'shishga tayyor
 *
 * "Done"/"active" holati DB da yo'q — bu computed:
 *   status='ready' AND group_id IS NOT NULL AND ∃ verified sheet
 *
 * group_id UNIQUE — bitta guruh faqat bitta userga bog'lanishi mumkin.
 */

const STATUSES = ['new', 'awaiting_phone', 'awaiting_gmail', 'ready'];

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    await queryInterface.createTable('users', {
      telegram_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        allowNull: false,
      },
      username: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      first_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      phone: {
        type: Sequelize.STRING(64),
        allowNull: true,
      },
      gmail: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      group_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
        unique: true,
      },
      status: {
        type: Sequelize.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'new',
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

    await queryInterface.addIndex('users', ['status'], {
      name: 'users_status_idx',
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.dropTable('users');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_status";');
  },
};
