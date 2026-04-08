'use strict';

/**
 * users.bot_is_admin — bot guruh ichida admin huquqiga egami?
 *
 * Maqsad: poller faqat bot admin bo'lgan guruhlarga lead jo'natadi.
 * Admin emas bo'lsa — leadlar to'planib turadi va bot DM da throttled alert
 * yuboradi (Redis TTL bilan), userni admin qilishga undaydi.
 *
 * Default false — eski rowlar uchun ham xavfsiz: poller ularga jo'natmaydi
 * to user botni admin qilmaguncha (yoki groupHandler eventidan keyin
 * qiymatni real status bilan yangilamaguncha).
 */

module.exports = {
  async up({ context: queryInterface, Sequelize }) {
    await queryInterface.addColumn('users', 'bot_is_admin', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.removeColumn('users', 'bot_is_admin');
  },
};
