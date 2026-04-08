/**
 * Lead row'ini (object: {colName: value}) chiroyli HTML xabarga aylantiradi.
 * Universal: istalgan ustunlarga moslashadi.
 */

const DEFAULT_HIDDEN = new Set([
  'id',
  'created_time',
  'ad_id',
  'ad_name',
  'adset_id',
  'adset_name',
  'campaign_id',
  'campaign_name',
  'form_id',
  'is_organic',
  'platform',
]);

function formatLeadMessage(row, language = 'uz') {
  const lang = String(language || 'uz').toLowerCase().startsWith('ru') ? 'ru' : 'uz';
  const lines = [];
  lines.push(lang === 'ru' ? '📩 <b>Новый лид</b>' : '📩 <b>Yangi lead</b>');
  lines.push('━━━━━━━━━━━━━━');

  const formName = row['form_name'];
  const createdTime = row['created_time'];

  // Yashiriladigan ustunlar
  const hidden = new Set(DEFAULT_HIDDEN);
  hidden.add('form_name');
  hidden.add('created_time');

  // Lead fieldlari
  for (const [header, value] of Object.entries(row)) {
    if (!header) continue;
    if (hidden.has(header.toLowerCase())) continue;
    if (value === null || value === undefined || String(value).trim() === '') continue;

    const label = beautifyFieldName(header);
    const valStr = String(value).trim();
    const icon = pickIcon(header, valStr);
    lines.push(`${icon} <b>${escapeHtml(label)}:</b> ${escapeHtml(valStr)}`);
  }

  lines.push('━━━━━━━━━━━━━━');

  const when = parseDate(createdTime) || new Date();
  lines.push(
    lang === 'ru'
      ? `📅 <b>Время:</b> ${escapeHtml(formatTashkentTime(when))}`
      : `📅 <b>Vaqt:</b> ${escapeHtml(formatTashkentTime(when))}`
  );

  if (formName) {
    lines.push(
      lang === 'ru'
        ? `📌 <b>Источник:</b> ${escapeHtml(String(formName).trim())}`
        : `📌 <b>Manba:</b> ${escapeHtml(String(formName).trim())}`
    );
  }

  return lines.join('\n');
}

/** "full_name" → "Full Name", "qaysi_oyda_umra" → "Qaysi Oyda Umra" */
function beautifyFieldName(name) {
  return String(name)
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

/** Ustun nomi yoki qiymatga qarab mos emoji tanlaydi */
function pickIcon(header, value) {
  const h = String(header).toLowerCase();
  const v = String(value).toLowerCase();

  if (/phone|telefon|raqam|\btel\b|mobil/.test(h)) return '📞';
  if (/^\+?\d[\d\s\-()]{6,}$/.test(v)) return '📞';

  if (/email|e[-_ ]?mail|pochta/.test(h)) return '✉️';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return '✉️';

  if (/full[_ ]?name|first[_ ]?name|last[_ ]?name|\bism\b|familiya|fio/.test(h)) return '👤';
  if (/city|shahar|viloyat|region|address|manzil/.test(h)) return '📍';
  if (/country|davlat|mamlakat/.test(h)) return '🌍';
  if (/date|sana|\boy\b|year|\byil\b|month/.test(h)) return '📅';
  if (/age|yosh/.test(h)) return '🎂';
  if (/company|kompaniya|firm/.test(h)) return '🏢';
  if (/budget|narx|price|summa|pul/.test(h)) return '💰';
  if (/comment|izoh|message|xabar/.test(h)) return '💬';

  return '•';
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatTashkentTime(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isTestLead(row) {
  for (const value of Object.values(row)) {
    const s = String(value || '').toLowerCase();
    if (s.includes('<test lead') || s.includes('test lead:')) return true;
  }
  return false;
}

module.exports = {
  formatLeadMessage,
  isTestLead,
  escapeHtml,
};
