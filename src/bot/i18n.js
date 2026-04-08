const SUPPORTED_LANGUAGES = ['uz', 'ru'];

function normalizeLanguage(language) {
  const value = String(language || '').toLowerCase();
  if (value.startsWith('ru')) return 'ru';
  if (value.startsWith('uz')) return 'uz';
  return 'uz';
}

function inferUserLanguage(user, fallbackLanguageCode) {
  if (user?.language) return normalizeLanguage(user.language);
  return normalizeLanguage(fallbackLanguageCode);
}

module.exports = {
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  inferUserLanguage,
};
