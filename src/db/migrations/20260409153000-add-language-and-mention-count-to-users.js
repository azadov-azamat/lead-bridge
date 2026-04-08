'use strict';

const LANGUAGES = ['uz', 'ru'];

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    await queryInterface.addColumn('users', 'language', {
      type: Sequelize.ENUM(...LANGUAGES),
      allowNull: false,
      defaultValue: 'uz',
    });

    await queryInterface.addColumn('users', 'mention_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.removeColumn('users', 'mention_count');
    await queryInterface.removeColumn('users', 'language');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_language";');
  },
};
