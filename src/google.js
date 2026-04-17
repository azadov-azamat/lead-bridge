/**
 * Google Sheets / Drive integration.
 *
 * Auth: faqat OAuth (refresh token bilan). Service account fallback olib
 * tashlangan — Render OAuth via GOOGLE_OAUTH_* env'lar bilan ishlaydi.
 */

const { google } = require('googleapis');
const config = require('./config');

// Facebook Lead Center Google Sheets integratsiyasi shu ustunlarni yozadi
const FB_SIGNATURE_COLUMNS = ['id', 'created_time', 'form_id', 'form_name'];

let cachedAuth = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;

  cachedAuth = new google.auth.OAuth2(
    config.googleOAuthClientId,
    config.googleOAuthClientSecret
  );
  cachedAuth.setCredentials({
    refresh_token: config.googleOAuthRefreshToken,
  });
  return cachedAuth;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function shareSheet(drive, { sheetId, sheetUrl, email, anyone }) {
  const permission = anyone
    ? { type: 'anyone', role: 'writer' }
    : { type: 'user', role: 'writer', emailAddress: email };

  try {
    await drive.permissions.create({
      fileId: sheetId,
      requestBody: permission,
      sendNotificationEmail: !anyone,
      emailMessage: anyone
        ? undefined
        : "Lead Bridge bot sizga Google Sheet tayyorladi. Bu sheet'ni Facebook Lead Center'ga ulang — keyingi qadamlar botda.",
    });
  } catch (err) {
    const hint = anyone
      ? `"anyone with link" sharing ishlamadi (Workspace external sharing taqiqlangan bo'lishi mumkin)`
      : `email "${email}" ga share qilib bo'lmadi`;
    throw new Error(`Sheet yaratildi (${sheetUrl}), lekin ${hint}: ${err.message}`);
  }
}

/**
 * Yangi Google Sheet yaratadi.
 * Default: "anyone with link can edit" (email berilmagan bo'lsa).
 * Email berilgan bo'lsa: faqat shu userga writer huquqi.
 */
async function generateSheet(title = 'Lead Bridge Sheet', shareWithEmail = null) {
  const sheets = getSheetsClient();
  const drive = getDriveClient();

  let sheetId, sheetUrl;
  try {
    const created = await sheets.spreadsheets.create({
      requestBody: { properties: { title } },
      fields: 'spreadsheetId,spreadsheetUrl',
    });
    sheetId = created.data.spreadsheetId;
    sheetUrl = created.data.spreadsheetUrl;
  } catch (err) {
    throw new Error(`Sheet yaratib bo'lmadi: ${err.message}`);
  }

  if (shareWithEmail) {
    const ownerEmail = normalizeEmail(config.googleOwnerEmail);
    const targetEmail = normalizeEmail(shareWithEmail);
    if (ownerEmail && ownerEmail === targetEmail) {
      return sheetUrl;
    }
    await shareSheet(drive, {
      sheetId,
      sheetUrl,
      email: shareWithEmail,
      anyone: false,
    });
  } else {
    await shareSheet(drive, {
      sheetId,
      sheetUrl,
      anyone: true,
    });
  }

  return sheetUrl;
}

/**
 * Yangi Google Sheet yaratadi va foydalanuvchi bilan share qiladi.
 * Return: { sheetId, sheetUrl }
 */
async function createSheetForUser({ title, userEmail }) {
  const sheets = getSheetsClient();
  const drive = getDriveClient();

  let res;
  try {
    res = await sheets.spreadsheets.create({
      requestBody: { properties: { title } },
      fields: 'spreadsheetId,spreadsheetUrl',
    });
  } catch (err) {
    throw new Error(`Sheet yaratib bo'lmadi: ${err.message}`);
  }

  const sheetId = res.data.spreadsheetId;
  const sheetUrl = res.data.spreadsheetUrl;

  // Agar ownerning o'zi bo'lmasa, foydalanuvchi ko'ra olishi uchun share
  const ownerEmail = normalizeEmail(config.googleOwnerEmail);
  const targetEmail = normalizeEmail(userEmail);
  if (!ownerEmail || ownerEmail !== targetEmail) {
    await shareSheet(drive, {
      sheetId,
      sheetUrl,
      email: userEmail,
      anyone: false,
    });
  }

  return { sheetId, sheetUrl };
}

function quoteSheetTitle(title) {
  return `'${String(title).replace(/'/g, "''")}'`;
}

/**
 * Spreadsheet'dagi har bir tabning birinchi qatorini o'qiydi va Facebook
 * ustunlariga mos keladigan tabni qaytaradi. Facebook Lead Center har form
 * uchun alohida tab yaratadi, shuning uchun default "Sheet1" emas.
 */
async function scanSheetTabs(sheetId) {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: 'sheets(properties(title))',
  });
  const tabs = (meta.data.sheets || []).map((s) => s.properties.title);
  if (tabs.length === 0) return { tabs: [], match: null, bestMissing: FB_SIGNATURE_COLUMNS, bestHeaders: [] };

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges: tabs.map((t) => `${quoteSheetTitle(t)}!1:1`),
  });
  const valueRanges = res.data.valueRanges || [];

  let bestHeaders = [];
  let bestMissing = FB_SIGNATURE_COLUMNS;
  for (let i = 0; i < tabs.length; i++) {
    const headers = (valueRanges[i]?.values && valueRanges[i].values[0]) || [];
    const normalized = headers.map((h) => String(h || '').trim().toLowerCase());
    const missing = FB_SIGNATURE_COLUMNS.filter((col) => !normalized.includes(col));
    if (missing.length === 0) {
      return { tabs, match: { tab: tabs[i], headers }, bestMissing: [], bestHeaders: headers };
    }
    if (missing.length < bestMissing.length) {
      bestMissing = missing;
      bestHeaders = headers;
    }
  }
  return { tabs, match: null, bestMissing, bestHeaders };
}

/**
 * Spreadsheet ichidagi har bir tabni tekshiradi — qaysidir tabda Facebook
 * Lead Center ustunlari bor-yo'qligini aniqlaydi.
 */
async function verifyFacebookConnection(sheetId) {
  try {
    const { match, bestMissing, bestHeaders } = await scanSheetTabs(sheetId);
    if (match) {
      return { verified: true, headers: match.headers, missing: [], tab: match.tab };
    }
    return { verified: false, headers: bestHeaders, missing: bestMissing };
  } catch (err) {
    return {
      verified: false,
      headers: [],
      missing: FB_SIGNATURE_COLUMNS,
      error: err.message,
    };
  }
}

/**
 * Facebook ustunlari bor tabdagi barcha rowlarni o'qiydi.
 * Return: { headers, rows } — har row { [colName]: value } shaklida
 */
async function readSheetRows(sheetId) {
  const sheets = getSheetsClient();
  const { match } = await scanSheetTabs(sheetId);
  if (!match) return { headers: [], rows: [] };

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${quoteSheetTitle(match.tab)}!A:ZZ`,
  });
  const values = res.data.values || [];
  if (values.length < 2) return { headers: [], rows: [] };

  const headers = values[0].map((h) => String(h || '').trim());
  const rows = values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : '';
    });
    return obj;
  });
  return { headers, rows };
}

module.exports = {
  FB_SIGNATURE_COLUMNS,
  generateSheet,
  createSheetForUser,
  verifyFacebookConnection,
  readSheetRows,
};
