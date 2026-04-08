const { Markup } = require('telegraf');

const startButton = Markup.inlineKeyboard([
  [Markup.button.callback('🚀 Boshlash', 'start_onboarding')],
]);

const requestPhone = Markup.keyboard([
  [Markup.button.contactRequest('📱 Raqamni yuborish')],
])
  .oneTime()
  .resize();

const removeKeyboard = Markup.removeKeyboard();

/**
 * Sheet uchun verify tugmasi. Callback data'ga sheet PK joylanadi.
 *   verify_sheet:<sheetPk>
 */
function verifySheetButton(sheetPk) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Ulandim', `verify_sheet:${sheetPk}`)],
  ]);
}

const restartButton = Markup.inlineKeyboard([
  [Markup.button.callback('🔄 Qayta boshlash', 'restart')],
]);

module.exports = {
  startButton,
  requestPhone,
  removeKeyboard,
  verifySheetButton,
  restartButton,
};
