const fs = require('fs');
const { google } = require('googleapis');
const config = require('./config');

// Facebook Lead Center Google Sheets integratsiyasi shu ustunlarni yozadi
const FB_SIGNATURE_COLUMNS = ['id', 'created_time', 'form_id', 'form_name'];
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/script.projects',
];

// Google autentifikatsiyasi (OAuth default, kerak bo'lsa service account fallback)
let cachedAuth = null;

function getAuthMode() {
  return config.googleAuthMode;
}

function getAuth() {
  if (cachedAuth) return cachedAuth;

  if (getAuthMode() === 'oauth') {
    if (
      !config.googleOAuthClientId ||
      !config.googleOAuthClientSecret ||
      !config.googleOAuthRefreshToken
    ) {
      throw new Error(
        'Google OAuth sozlanmagan. GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET va GOOGLE_OAUTH_REFRESH_TOKEN kerak.'
      );
    }

    cachedAuth = new google.auth.OAuth2(
      config.googleOAuthClientId,
      config.googleOAuthClientSecret
    );
    cachedAuth.setCredentials({
      refresh_token: config.googleOAuthRefreshToken,
    });
    return cachedAuth;
  }

  if (!fs.existsSync(config.googleCredentialsPath)) {
    throw new Error(
      `Google credential topilmadi. OAuth uchun env'larni to'ldiring yoki service account JSON qo'ying: ${config.googleCredentialsPath}`
    );
  }

  cachedAuth = new google.auth.GoogleAuth({
    keyFile: config.googleCredentialsPath,
    scopes: GOOGLE_SCOPES,
  });
  return cachedAuth;
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

function isPermissionDeniedError(err) {
  return (
    err?.code === 403 ||
    err?.response?.status === 403 ||
    err?.response?.data?.error?.status === 'PERMISSION_DENIED' ||
    /does not have permission/i.test(err?.message || '')
  );
}

async function explainSpreadsheetCreateError(err, drive) {
  if (getAuthMode() !== 'oauth' && isPermissionDeniedError(err)) {
    try {
      const about = await drive.about.get({
        fields: 'user(emailAddress),storageQuota(limit)',
      });
      if (about.data?.storageQuota?.limit === '0') {
        const email = about.data?.user?.emailAddress || 'service account';
        return (
          `Sheet yaratib bo'lmadi: ${email} uchun Google Drive storage quota 0. ` +
          `Bu service account yangi Google Sheet'ga owner bo'la olmaydi. ` +
          `Yechim: service account'ni Shared Drive'ga qo'shing va sheet'ni o'sha yerda yarating, ` +
          `yoki oddiy Google OAuth orqali foydalanuvchi nomidan yarating.`
        );
      }
    } catch (_) {
      // Asl xatoni saqlab qolamiz; diagnostika yordam bermasa generic xabar qaytariladi.
    }
  }

  return `Sheet yaratib bo'lmadi (Sheets API muammo bo'lishi mumkin): ${err.message}`;
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
        : 'Lead Bridge bot sizga Google Sheet tayyorladi. Bu sheet\'ni Facebook Lead Center\'ga ulang — keyingi qadamlar botda.',
    });
  } catch (err) {
    const hint = anyone
      ? `"anyone with link" sharing ishlamadi (Workspace external sharing taqiqlangan bo'lishi mumkin)`
      : `email "${email}" ga share qilib bo'lmadi`;
    throw new Error(`Sheet yaratildi (${sheetUrl}), lekin ${hint}: ${err.message}`);
  }
}

/**
 * Yangi Google Sheet yaratadi va "anyone with link can edit" sifatida ochadi.
 * Hech qanday email kerak emas — har kim link orqali kirib tahrirlay oladi.
 * Return: sheet URL (string)
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
    throw new Error(await explainSpreadsheetCreateError(err, drive));
  }

  // Agar email ko'rsatilgan bo'lsa — shu userga writer huquqi beramiz.
  // Aks holda — "anyone with link" sharing.
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
      requestBody: {
        properties: { title },
      },
      fields: 'spreadsheetId,spreadsheetUrl',
    });
  } catch (err) {
    throw new Error(await explainSpreadsheetCreateError(err, drive));
  }

  const sheetId = res.data.spreadsheetId;
  const sheetUrl = res.data.spreadsheetUrl;

  // Agar ownerning o'zi bo'lmasa, foydalanuvchi ko'ra olishi uchun share qilamiz
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
 * Sheet'ning birinchi qatoridagi headerlarni o'qiydi.
 * Facebook Lead Center ustunlari bor-yo'qligini tekshiradi.
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
 * Return: { headers, rows } — rows har biri { [colName]: value } shaklida
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
