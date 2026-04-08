'use strict';

/**
 * Gmail va Telegram guruhni user darajasidan sheet darajasiga ko'chirish.
 *
 * Maqsad: bitta userning bir nechta sheet'lari bo'lganda har sheet o'z
 * gmail akkountiga va o'z Telegram guruhiga ega bo'lishi mumkin. Eskidagi
 * "1 user — 1 group — 1 gmail" cheklovi olib tashlanadi.
 *
 * Yangiliklar:
 *   - `groups` jadvali (Telegram chat sifatida bitta entity)
 *   - `sheets.gmail` va `sheets.group_id` ustunlari
 *   - `users.gmail`, `users.group_id`, `users.bot_is_admin` o'chiriladi
 *
 * Backfill: har userning eski group_id si bitta `groups` row'ga aylanadi
 * va shu userning barcha sheet'lariga ham gmail, ham group_id biriktiriladi.
 */

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    await queryInterface.createTable('groups', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        allowNull: false,
      },
      owner_telegram_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'telegram_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      bot_is_admin: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
    await queryInterface.addIndex('groups', ['owner_telegram_id'], {
      name: 'groups_owner_telegram_id_idx',
    });

    await queryInterface.addColumn('sheets', 'gmail', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('sheets', 'group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'groups', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
    await queryInterface.addIndex('sheets', ['group_id'], {
      name: 'sheets_group_id_idx',
    });

    // Backfill: har user uchun bitta group, va sheetlarga gmail/group_id
    await queryInterface.sequelize.query(`
      INSERT INTO groups (id, owner_telegram_id, title, bot_is_admin, created_at, updated_at)
      SELECT group_id, telegram_id, NULL, bot_is_admin, NOW(), NOW()
      FROM users
      WHERE group_id IS NOT NULL
      ON CONFLICT (id) DO NOTHING;
    `);
    await queryInterface.sequelize.query(`
      UPDATE sheets s
      SET gmail = u.gmail, group_id = u.group_id
      FROM users u
      WHERE s.user_telegram_id = u.telegram_id;
    `);

    // Eski "awaiting_gmail" statusidagi userlar — endi gmail user darajasida
    // so'ralmaydi, ularni 'ready' ga ko'chiramiz (gmail keyingi /newsheet da so'raladi).
    await queryInterface.sequelize.query(`
      UPDATE users SET status = 'ready' WHERE status = 'awaiting_gmail';
    `);

    await queryInterface.removeColumn('users', 'gmail');
    await queryInterface.removeColumn('users', 'group_id');
    await queryInterface.removeColumn('users', 'bot_is_admin');
  },

  async down({ context: queryInterface, Sequelize }) {
    await queryInterface.addColumn('users', 'gmail', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'group_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('users', 'bot_is_admin', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.removeIndex('sheets', 'sheets_group_id_idx');
    await queryInterface.removeColumn('sheets', 'group_id');
    await queryInterface.removeColumn('sheets', 'gmail');
    await queryInterface.dropTable('groups');
  },
};
