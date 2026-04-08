/**
 * Markaziy poller — har N daqiqada barcha verified sheetlarni o'qib,
 * yangi leadlarni egasining Telegram guruhiga jo'natadi.
 *
 * Asosiy o'zgarishlar (multi-sheet refactor):
 *   - Endi user'larni emas, **sheetlarni** iterate qilamiz (1 user → N sheet).
 *   - Dedup: per-sheet (sent_leads.sheet_id, lead_id) — chunki bir nechta
 *     sheetda bir xil 'id' bo'lmasligi mumkin, lekin relational toza yondashuv.
 *   - Sheet'ning o'zi xato bersa (verifikatsiya buzilgan, FB ulanish uzilgan),
 *     faqat o'sha sheet `error` statusiga tushadi — qolgan sheetlar ishlayveradi.
 *   - Telegram guruh muammosi (kicked/blocked) bo'lsa, group_id'ni tozalaymiz
 *     — keyingi qadamda user yangi guruhga qo'sha oladi.
 *
 * Concurrency: Redis distributed lock (`lock:poller:tick`). Multi-instance
 * deployda faqat bitta jarayon tickni bajaradi.
 */

const config = require('./config');
const db = require('./db');
const google = require('./google');
const redis = require('./redis');
const { formatLeadMessage, isTestLead } = require('./formatter');

const POLLER_LOCK_KEY = 'lock:poller:tick';

let timer = null;

function start(bot) {
  console.log(`[poller] har ${config.pollIntervalMs}ms da ishlaydi`);
  tick(bot).catch((err) => console.error('[poller] tick xato:', err));
  timer = setInterval(() => {
    tick(bot).catch((err) => console.error('[poller] tick xato:', err));
  }, config.pollIntervalMs);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick(bot) {
  const result = await redis.withLock(POLLER_LOCK_KEY, config.pollerLockTtlMs, async () => {
    const sheets = await db.getSheetsForPolling();
    if (sheets.length === 0) return 0;

    let totalSent = 0;
    for (const sheet of sheets) {
      try {
        const sent = await processSheet(bot, sheet);
        totalSent += sent;
      } catch (err) {
        console.error(
          `[poller] sheet=${sheet.id} (${sheet.spreadsheetId}) xato:`,
          err.message
        );
        // Sheet darajasidagi xato — sheet'ni error ga o'tkazamiz
        await db.updateSheet(sheet.id, {
          status: 'error',
          errorReason: err.message.slice(0, 500),
        });
        // Userga DM yuboramiz (best effort)
        try {
          await bot.telegram.sendMessage(
            sheet.userTelegramId,
            `⚠️ Sheet'da muammo bor: <a href="${sheet.spreadsheetUrl}">Sheet</a>\n<code>${escapeHtml(err.message)}</code>\n\n/sheets — holatni ko'rish`,
            { parse_mode: 'HTML', disable_web_page_preview: true }
          );
        } catch (_) {}
      }
    }
    return totalSent;
  });

  if (result === null) {
    // Boshqa instance lock'ni ushlab turibdi
    return;
  }
  if (result > 0) {
    console.log(`[poller] ${result} ta lead jo'natildi`);
  }
}

async function processSheet(bot, sheet) {
  const { rows } = await google.readSheetRows(sheet.spreadsheetId);

  // last_polled_at ni har holda yangilaymiz
  await db.updateSheet(sheet.id, { lastPolledAt: new Date() });

  if (rows.length === 0) return 0;

  const sentIds = await db.getSentLeadIds(sheet.id);
  let sent = 0;

  for (const row of rows) {
    // Lead ID — faqat 'id' ustunidan. Aks holda skip
    // (oldingi `row-${i}` fallback Sheet'dan satr o'chirilsa indeks
    // siljiganligi sababli dublikat yuborgan).
    const rawId = row.id || row.ID;
    if (!rawId) continue;
    const leadId = String(rawId).trim();
    if (!leadId) continue;
    if (sentIds.has(leadId)) continue;

    // Bo'sh row
    if (Object.values(row).every((v) => !String(v || '').trim())) continue;

    // Test lead — belgilab qo'yamiz, yubormaymiz
    if (isTestLead(row)) {
      await db.markLeadSent(sheet.id, leadId);
      continue;
    }

    const text = formatLeadMessage(row);
    try {
      await bot.telegram.sendMessage(sheet.user.groupId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      await db.markLeadSent(sheet.id, leadId);
      sent++;
    } catch (err) {
      console.error(
        `[poller] telegram send fail user=${sheet.userTelegramId} group=${sheet.user.groupId}:`,
        err.message
      );
      const msg = err.message || '';
      if (
        msg.includes('chat not found') ||
        msg.includes('kicked') ||
        msg.includes('bot was blocked') ||
        msg.includes('not enough rights') ||
        msg.includes('group chat was upgraded')
      ) {
        // Guruh muammosi — group_id ni tozalaymiz, user qaytadan qo'shsin
        console.warn(
          `[poller] user=${sheet.userTelegramId} guruh muammo, groupId tozalanmoqda`
        );
        await db.updateUser(sheet.userTelegramId, { groupId: null });
        try {
          await bot.telegram.sendMessage(
            sheet.userTelegramId,
            `⚠️ Telegram guruhga ulana olmadim. Meni guruhdan chiqarib, qaytadan qo'shing va admin qiling. /changegroup`,
            { parse_mode: 'HTML' }
          );
        } catch (_) {}
        return sent;
      }
      // Boshqa xatolar (rate limit va h.k.) — keyingi tickda qayta urinamiz
    }
  }

  return sent;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { start, stop };
