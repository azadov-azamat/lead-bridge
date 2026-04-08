'use strict';

/**
 * sheets.is_deleted + deleted_at — soft delete.
 *
 * Foydalanuvchi sheetni o'chirganda jadvaldan o'chirilmaydi: faqat
 * `is_deleted=true` va `deleted_at=NOW()` belgilanadi. Listing/poller
 * so'rovlari `is_deleted=false` ni filter qiladi.
 */

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    await queryInterface.addColumn('sheets', 'is_deleted', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('sheets', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex('sheets', ['is_deleted'], {
      name: 'sheets_is_deleted_idx',
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.removeIndex('sheets', 'sheets_is_deleted_idx');
    await queryInterface.removeColumn('sheets', 'deleted_at');
    await queryInterface.removeColumn('sheets', 'is_deleted');
  },
};
