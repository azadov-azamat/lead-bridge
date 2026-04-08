/**
 * Markaziy poller — har N daqiqada barcha verified sheetlarni o'qib,
 * yangi leadlarni egasining Telegram guruhiga jo'natadi.
 *
 * Tick ikki bosqichdan iborat:
 *   1. ACTIVE PASS: bot admin bo'lgan userlarning verified sheetlari → leadlarni guruhga jo'natish.
 *   2. AWAITING-ADMIN PASS: bot admin bo'lmagan userlar uchun → yangi unsent leadlarni hisoblab,
 *      kerak bo'lsa throttled DM alert yuborish ("sizda N ta lead bor, meni admin qiling").
 *
 * Dedup: per-sheet (`sent_leads.sheet_id, lead_id`).
 * Concurrency: Redis distributed lock (`lock:poller:tick`).
 * Per-sheet error isolation: bitta sheet xato bersa, faqat o'sha sheet `error` ga tushadi.
 */

const config = require('./config');
const db = require('./db');
const google = require('./google');
const redis = require('./redis');
const messages = require('./bot/messages');
const { formatLeadMessage, isTestLead } = require('./formatter');

const POLLER_LOCK_KEY = 'lock:poller:tick';

let timer = null;
let inflightTick = null;
let stopping = false;

function start(bot) {
  console.log(`[poller] har ${config.pollIntervalMs}ms da ishlaydi`);
  scheduleTick(bot);
  timer = setInterval(() => scheduleTick(bot), config.pollIntervalMs);
}

function scheduleTick(bot) {
  if (stopping || inflightTick) return;
  inflightTick = tick(bot)
    .catch((err) => console.error('[poller] tick xato:', err))
    .finally(() => {
      inflightTick = null;
    });
}

/**
 * Stop pollerni to'xtatadi va inflight tick tugashini kutadi (graceful).
 * Shutdown sequence Redis yopilmasidan oldin chaqirishi kerak.
 */
async function stop() {
  stopping = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (inflightTick) {
    try {
      await inflightTick;
    } catch (_) {}
  }
}

async function tick(bot) {
  const result = await redis.withLock(POLLER_LOCK_KEY, config.pollerLockTtlMs, async () => {
    const totalSent = await activePass(bot);
    const alertsSent = await awaitingAdminPass(bot);
    return { totalSent, alertsSent };
  });

  if (result === null) {
    // Boshqa instance lock'ni ushlab turibdi
    return;
  }
  if (result.totalSent > 0) {
    console.log(`[poller] ${result.totalSent} ta lead jo'natildi`);
  }
  if (result.alertsSent > 0) {
    console.log(`[poller] ${result.alertsSent} ta not-admin alert yuborildi`);
  }
}

// ============================================================
// PASS 1: bot admin bo'lgan sheetlar — leadlarni jo'natish
// ============================================================
async function activePass(bot) {
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
      await db.updateSheet(sheet.id, {
        status: 'error',
        errorReason: err.message.slice(0, 500),
      });
      const copy = messages.forLanguage(sheet.user?.language);
      try {
        await bot.telegram.sendMessage(
          sheet.userTelegramId,
          copy.sheetIssue(sheet.spreadsheetUrl, err.message),
          { parse_mode: 'HTML', disable_web_page_preview: true }
        );
      } catch (_) {}
    }
  }
  return totalSent;
}

// ============================================================
// PASS 2: bot admin BO'LMAGAN sheetlar — alert (throttled)
// ============================================================
//
// Logika:
//   1. Verified sheetlari bor, lekin bot admin emas userlarni topamiz.
//   2. Har user uchun unsent leadlar sonini hisoblaymiz (sheetlardan,
//      sent_leads dedup bilan).
//   3. Agar count > 0 va alert lock olindi (throttle TTL ichida birinchi
//      marta) → DM yuboramiz.
//   4. Bu yerda leadlarni `markLeadSent` qilmaymiz — chunki ular hali
//      jo'natilmagan. Admin qilingach, keyingi activePass ularni jo'natadi.
async function awaitingAdminPass(bot) {
  const sheets = await db.getSheetsAwaitingAdmin();
  if (sheets.length === 0) return 0;

  // Guruh bo'yicha guruhlash: bitta groupga bir nechta sheet tegishli bo'lishi mumkin
  const byGroup = new Map();
  for (const sheet of sheets) {
    const key = String(sheet.groupId);
    if (!byGroup.has(key)) {
      byGroup.set(key, { group: sheet.group, user: sheet.user, sheets: [] });
    }
    byGroup.get(key).sheets.push(sheet);
  }

  let alertsSent = 0;
  for (const [groupKey, { group, user, sheets: groupSheets }] of byGroup) {
    try {
      // Har sheet'dagi unsent leadlarni hisoblaymiz
      let pendingCount = 0;
      for (const sheet of groupSheets) {
        try {
          const { rows } = await google.readSheetRows(sheet.spreadsheetId);
          await db.updateSheet(sheet.id, { lastPolledAt: new Date() });
          if (rows.length === 0) continue;
          const sentIds = await db.getSentLeadIds(sheet.id);
          for (const row of rows) {
            const rawId = row.id || row.ID;
            if (!rawId) continue;
            const leadId = String(rawId).trim();
            if (!leadId) continue;
            if (sentIds.has(leadId)) continue;
            if (Object.values(row).every((v) => !String(v || '').trim())) continue;
            if (isTestLead(row)) continue;
            pendingCount++;
          }
        } catch (err) {
          console.error(
            `[poller] awaitingAdmin: sheet=${sheet.id} read xato:`,
            err.message
          );
        }
      }

      if (pendingCount === 0) continue;

      // Throttle: 4 soatda bir marta (group bo'yicha)
      const acquired = await db.tryClaimNotAdminAlert(group.id);
      if (!acquired) continue;

      const copy = messages.forLanguage(user.language);
      let groupTitle = group.title || copy.groupTitleFallback;
      try {
        const chat = await bot.telegram.getChat(group.id);
        if (chat?.title) groupTitle = escapeHtml(chat.title);
      } catch (_) {}

      try {
        await bot.telegram.sendMessage(
          user.telegramId,
          copy.notAdminAlert(pendingCount, groupTitle),
          { parse_mode: 'HTML' }
        );
        alertsSent++;
        console.log(
          `[poller] not-admin alert: user=${user.telegramId} group=${group.id} pending=${pendingCount}`
        );
      } catch (err) {
        console.error(
          `[poller] not-admin alert DM yuborilmadi user=${user.telegramId}:`,
          err.message
        );
      }
    } catch (err) {
      console.error(
        `[poller] awaitingAdmin group=${groupKey} xato:`,
        err.message
      );
    }
  }
  return alertsSent;
}

// ============================================================
// Per-sheet processing (admin holatda)
// ============================================================
async function processSheet(bot, sheet) {
  const groupId = sheet.group?.id || sheet.groupId;
  if (!groupId) return 0;

  const { rows } = await google.readSheetRows(sheet.spreadsheetId);

  await db.updateSheet(sheet.id, { lastPolledAt: new Date() });

  if (rows.length === 0) return 0;

  const sentIds = await db.getSentLeadIds(sheet.id);
  let sent = 0;

  for (const row of rows) {
    const rawId = row.id || row.ID;
    if (!rawId) continue;
    const leadId = String(rawId).trim();
    if (!leadId) continue;
    if (sentIds.has(leadId)) continue;

    if (Object.values(row).every((v) => !String(v || '').trim())) continue;

    if (isTestLead(row)) {
      await db.markLeadSent(sheet.id, leadId);
      continue;
    }

    const text = formatLeadMessage(row, sheet.user?.language);
    try {
      await bot.telegram.sendMessage(groupId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      await db.markLeadSent(sheet.id, leadId);
      sent++;
    } catch (err) {
      console.error(
        `[poller] telegram send fail sheet=${sheet.id} group=${groupId}:`,
        err.message
      );
      const msg = err.message || '';

      // Admin huquqi yo'q — group botIsAdmin=false ga o'tkazamiz
      // (my_chat_member event keladigan vaqtga qadar)
      if (msg.includes('not enough rights') || msg.includes('CHAT_ADMIN_REQUIRED')) {
        console.warn(
          `[poller] group=${groupId} botIsAdmin=false ga o'tkazilmoqda (rights yo'q)`
        );
        await db.updateGroup(groupId, { botIsAdmin: false });
        return sent;
      }

      // Guruh muammosi — group rowni o'chiramiz (sheet.groupId FK SET NULL)
      if (
        msg.includes('chat not found') ||
        msg.includes('kicked') ||
        msg.includes('bot was blocked') ||
        msg.includes('group chat was upgraded')
      ) {
        console.warn(
          `[poller] group=${groupId} muammo, group o'chirilmoqda`
        );
        await db.deleteGroup(groupId);
        const copy = messages.forLanguage(sheet.user?.language);
        try {
          await bot.telegram.sendMessage(
            sheet.userTelegramId,
            copy.groupReconnectRequired,
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
