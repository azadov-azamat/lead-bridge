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

/**
 * Sheet'ning birinchi qatoridagi headerlarni o'qiydi va Facebook Lead Center
 * ustunlari bor-yo'qligini tekshiradi.
 */
async function verifyFacebookConnection(sheetId) {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '1:1',
    });
    const headers = (res.data.values && res.data.values[0]) || [];
    const normalized = headers.map((h) => String(h || '').trim().toLowerCase());
    const missing = FB_SIGNATURE_COLUMNS.filter((col) => !normalized.includes(col));
    return {
      verified: missing.length === 0,
      headers,
      missing,
    };
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
 * Sheet'dagi barcha rowlarni o'qiydi.
 * Return: { headers, rows } — har row { [colName]: value } shaklida
 */
async function readSheetRows(sheetId) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A:ZZ',
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
