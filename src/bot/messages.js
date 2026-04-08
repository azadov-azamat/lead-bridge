/**
 * Foydalanuvchiga ko'rsatiladigan barcha matnlar shu yerda.
 * Tilik: o'zbek.
 *
 * Format konvensiyasi: HTML parse mode (Telegraf `replyWithHTML`).
 */

const SHEET_STATUS_LABEL = {
  pending_verification: '⏳ FB ulanishi kutilmoqda',
  verified: '✅ Faol',
  error: '❌ Xato',
};

module.exports = {
  // ============================================================
  // Onboarding
  // ============================================================

  welcome: (name) =>
    `Salom${name ? `, <b>${name}</b>` : ''}! 👋\n\n` +
    `Men <b>Lead Bridge</b> botiman. Sizning Instagram va Facebook reklamalaringizdan kelgan leadlarni avtomatik ravishda Telegram guruhingizga olib beraman.\n\n` +
    `Sozlash 4 qadamdan iborat:\n` +
    `1️⃣ Telefon raqamingizni qoldirish\n` +
    `2️⃣ Gmail manzilingizni berish\n` +
    `3️⃣ Facebook Lead Center'ga ulanish\n` +
    `4️⃣ Meni Telegram guruhga qo'shish\n\n` +
    `Boshlash uchun pastdagi tugmani bosing.`,

  askPhone:
    `📱 <b>1-qadam: Telefon raqamingiz</b>\n\n` +
    `Sizni tanib olishimiz uchun telefon raqamingizni yuboring.\n\n` +
    `Pastdagi <b>"📱 Raqamni yuborish"</b> tugmasini bosing.`,

  phoneSaved: (phone) =>
    `✅ Raqam saqlandi: <code>${phone}</code>\n\n` +
    `Endi keyingi qadamga o'tamiz.`,

  askGmail:
    `📧 <b>2-qadam: Gmail manzilingiz</b>\n\n` +
    `Men sizga Google Sheet tayyorlab beraman va shu sheet'ni sizning Gmail manzilingizga ulashaman.\n\n` +
    `Iltimos, <b>Gmail manzilingizni</b> yuboring (masalan: <code>siz@gmail.com</code>).\n\n` +
    `⚠️ Bu manzil siz Facebook'da ishlatadigan Google akkountingiz bilan bir xil bo'lishi muhim — chunki Facebook Lead Center shu akkountga ulanadi.`,

  invalidGmail:
    `❌ Bu Gmail manzilga o'xshamayapti. Iltimos, to'g'ri formatda yuboring: <code>siz@gmail.com</code>`,

  creatingSheet: `⏳ Google Sheet yaratilyapti...`,

  /**
   * Sheet yaratilgandan keyin (birinchi yoki /newsheet orqali).
   * sheetUrl — Google sheet URL.
   * isFirst — birinchi sheetmi (onboarding) yoki qo'shimchami.
   */
  sheetCreated: (sheetUrl, isFirst = true) =>
    (isFirst
      ? `✅ <b>Sheet tayyor!</b>\n\n`
      : `✅ <b>Yangi sheet yaratildi!</b>\n\n`) +
    `🔗 <a href="${sheetUrl}">Google Sheet'ni ochish</a>\n\n` +
    `Sheet sizning Gmail manzilingizga ulashildi — Google Drive'da topishingiz mumkin.\n\n` +
    `━━━━━━━━━━━━━━\n` +
    `📘 <b>Facebook Lead Center'ga ulang</b>\n\n` +
    `1. <a href="https://business.facebook.com/latest/leads_center">Meta Business Suite → Lead Center</a>'ni oching\n` +
    `2. Chap menyudan <b>"Integrations"</b> ni tanlang\n` +
    `3. <b>"Google Sheets"</b> integratsiyasini toping va <b>"Connect"</b> bosing\n` +
    `4. Forma(lar)ni tanlang va yuqoridagi sheet linkini joylang\n` +
    `5. Google akkountingiz orqali ruxsat bering\n` +
    `6. Tayyor bo'lgach, pastdagi <b>"✅ Ulandim"</b> tugmasini bosing\n\n` +
    `💡 Yo'riqnoma: <a href="https://www.facebook.com/business/help/447834325474833">Facebook rasmiy hujjati</a>`,

  verifying: `⏳ Sheet'ni tekshiryapman...`,

  /**
   * Sheet muvaffaqiyatli verifikatsiya qilingandan keyin.
   * needsGroup — true bo'lsa, hali guruh ulanmagan (birinchi marta).
   */
  sheetVerifiedSuccess: (needsGroup) =>
    `✅ <b>Sheet tasdiqlandi!</b>\n\n` +
    `Facebook Lead Center ustunlari topildi. Ushbu sheet'dan kelgan leadlar avtomatik guruhga jo'natiladi.\n\n` +
    (needsGroup
      ? `━━━━━━━━━━━━━━\n` +
        `👥 <b>Keyingi qadam: Meni guruhga qo'shing</b>\n\n` +
        `Endi men leadlarni qaysi guruhga jo'natishimni bilishim kerak.\n\n` +
        `1. O'zingizning Telegram guruhingizni oching (yoki yangi yarating)\n` +
        `2. Guruh sozlamalari → <b>"Add members"</b>\n` +
        `3. Meni qidiring va qo'shing\n` +
        `4. <b>MUHIM:</b> Meni <b>admin</b> qilib belgilang (xabar jo'natish uchun kerak)\n\n` +
        `Men o'zim qachon qo'shilganimni va qaysi guruh ekanligini bilaman. ✨`
      : `Siz endi /sheets orqali barcha sheetlaringizni ko'rishingiz va /newsheet orqali yangisini qo'shishingiz mumkin.`),

  sheetVerifyFail: (missing) =>
    `❌ <b>Hali ulanish topilmadi</b>\n\n` +
    `Sheet'da Facebook ustunlari topilmadi:\n` +
    `<code>${missing.join(', ')}</code>\n\n` +
    `Iltimos, quyidagilarni tekshiring:\n` +
    `• Facebook Lead Center'da Google Sheets integratsiyasi yoqilgan\n` +
    `• To'g'ri sheet linki ulangan\n` +
    `• Ulangan akkount uchun ruxsat berilgan\n\n` +
    `Tayyor bo'lganda yana <b>"✅ Ulandim"</b> tugmasini bosing.\n\n` +
    `💡 Maslahat: Facebook'da <b>"Lead Ads Testing Tool"</b> orqali bitta sinov leadi jo'nating — shunda Facebook headerlarni avtomatik yaratadi.`,

  // ============================================================
  // Group binding
  // ============================================================

  groupAdded: (groupTitle) =>
    `🎉 <b>Tabriklayman! Hammasi tayyor.</b>\n\n` +
    `Men <b>"${groupTitle}"</b> guruhiga qo'shildim va u yerga leadlarni jo'natishni boshlayman.\n\n` +
    `📊 Endi har 1 daqiqada yangi leadlar Sheet(lar)ingizdan o'qiladi va guruhga keladi.\n\n` +
    `Foydali komandalar:\n` +
    `• /status — joriy holat\n` +
    `• /sheets — barcha sheetlaringiz\n` +
    `• /newsheet — yana bitta sheet qo'shish\n` +
    `• /changegroup — guruhni o'zgartirish`,

  groupAddedToChat: (firstName) =>
    `👋 Salom! Men <b>Lead Bridge</b> botiman.\n\n` +
    `${firstName ? `<b>${firstName}</b>` : 'Egam'} meni shu guruhga ulash uchun qo'shdi. Endi yangi Facebook/Instagram leadlar shu yerga avtomatik kelib turadi.\n\n` +
    `✅ Sozlash tugadi.`,

  notAdmin:
    `⚠️ Men <b>admin</b> emasman shu guruhda.\n\n` +
    `Iltimos, sozlamalardan meni admin qilib belgilang — aks holda xabar jo'nata olmayman.`,

  /**
   * Bot guruhga qo'shildi, lekin admin emas — userga DM da batafsil instruktsiya.
   */
  notAdminDm: (groupTitle) =>
    `⚠️ Men <b>${groupTitle}</b> guruhiga qo'shildim, lekin <b>admin</b> emasman.\n\n` +
    `Xavfsizlik uchun men admin bo'lmaguncha leadlarni guruhga jo'natmayman.\n\n` +
    `<b>Meni qanday admin qilish:</b>\n` +
    `1. Guruh sozlamalarini oching\n` +
    `2. <b>"Administrators"</b> bo'limiga kiring\n` +
    `3. <b>"Add Administrator"</b> bosing\n` +
    `4. Mening profilimni tanlang\n` +
    `5. Saqlang\n\n` +
    `Tayyor bo'lganingizdan so'ng leadlar avtomatik yetib kela boshlaydi. ✨`,

  /**
   * Yangi leadlar bor, lekin bot hali admin emas — throttled alert (DM).
   * count — kutilayotgan unsent leadlar soni.
   */
  notAdminAlert: (count, groupTitle) =>
    `🔔 <b>Yangi ${count} ta lead keldi!</b>\n\n` +
    `Lekin men <b>${groupTitle}</b> guruhida hali admin emasman, shuning uchun ularni sizga jo'nata olmayapman.\n\n` +
    `<b>Leadlarni ko'rish uchun meni admin qiling:</b>\n` +
    `1. Guruh sozlamalari → <b>Administrators</b>\n` +
    `2. <b>Add Administrator</b> → meni tanlang\n` +
    `3. Saqlang\n\n` +
    `Admin bo'lganimdan so'ng to'plangan barcha leadlarni darhol jo'nataman. 📨`,

  /**
   * Bot admin qilindi (member → administrator).
   */
  botPromoted: (groupTitle) =>
    `✅ <b>Rahmat!</b> Endi men <b>${groupTitle}</b> guruhida adminman.\n\n` +
    `Yangi leadlar avtomatik kelib turadi. Agar to'plangan leadlar bo'lsa, hozir jo'nataman. 📨`,

  /**
   * Bot admin huquqidan mahrum qilindi (administrator → member).
   */
  botDemoted: (groupTitle) =>
    `⚠️ Men <b>${groupTitle}</b> guruhida admin huquqidan mahrum qilindim.\n\n` +
    `Endi leadlarni guruhga jo'nata olmayman. Iltimos, meni qaytadan admin qiling — aks holda yangi leadlar to'planib qoladi.`,

  /**
   * User boshqa guruhga botni qo'shganda (allaqachon bog'langan).
   */
  alreadyBoundDm: (oldGroupId) =>
    `⚠️ <b>Siz allaqachon boshqa guruhga bog'langansiz.</b>\n\n` +
    `Joriy guruh ID: <code>${oldGroupId}</code>\n\n` +
    `Bitta foydalanuvchi faqat bitta guruhga ulanishi mumkin. Yangi guruhga o'tish uchun:\n` +
    `• /changegroup buyrug'ini bosing yoki\n` +
    `• Eski guruhdan meni chiqarib, yangisiga qo'shing.`,

  alreadyBoundGroup:
    `⚠️ Bu foydalanuvchi allaqachon boshqa guruhga bog'langan.\n\n` +
    `Bitta foydalanuvchi faqat bitta guruhga ulana oladi. Men bu guruhni tark etaman.`,

  /**
   * /changegroup bosilganda — yo'riqnoma.
   */
  changeGroupInstructions: (oldGroupId) =>
    `🔄 <b>Guruhni o'zgartirish</b>\n\n` +
    `Joriy guruh ID: <code>${oldGroupId}</code>\n\n` +
    `Yangi guruhga o'tish uchun:\n` +
    `1. <b>Avval meni eski guruhdan chiqaring</b> (Remove from group)\n` +
    `2. Men sizga DM da yangi guruhga qo'shish bo'yicha yo'riqnoma yuboraman\n` +
    `3. Yangi guruhga meni qo'shing va admin qiling\n\n` +
    `⚠️ Bot eski guruhdan chiqmaguncha yangisiga ulay olmayman.`,

  changeGroupNoCurrent:
    `ℹ️ Sizda hozirda hech qanday guruh ulanmagan. Guruhga qo'shish uchun:\n\n` +
    `1. O'zingizning Telegram guruhingizni oching\n` +
    `2. Sozlamalar → <b>"Add members"</b>\n` +
    `3. Meni qidiring va qo'shing (admin qilib)`,

  /**
   * Bot guruhdan chiqarilganda — DM da yangi guruhga qo'shish bo'yicha xabar.
   */
  groupRemovedDm: (oldTitle) =>
    `ℹ️ Men <b>${oldTitle}</b> guruhidan chiqarildim.\n\n` +
    `Endi yangi guruhga qo'shishingiz mumkin:\n\n` +
    `1. O'zingizning Telegram guruhingizni oching (yoki yangi yarating)\n` +
    `2. Sozlamalar → <b>"Add members"</b>\n` +
    `3. Meni qidiring va qo'shing\n` +
    `4. <b>MUHIM:</b> Meni <b>admin</b> qilib belgilang\n\n` +
    `Yangi guruhga qo'shilganimni o'zim aniqlayman. ✨`,

  // ============================================================
  // Sheet management
  // ============================================================

  newSheetNotReady:
    `⚠️ Avval profile sozlashni tugating. /start bosing.`,

  newSheetCreating: `⏳ Yangi Google Sheet yaratilyapti...`,

  /**
   * /sheets ro'yxati. sheets — db.listUserSheets natijasi.
   */
  sheetsList: (sheets) => {
    if (sheets.length === 0) {
      return (
        `📭 Sizda hech qanday sheet yo'q.\n\n` +
        `Yangi sheet yaratish uchun /newsheet bosing.`
      );
    }
    const lines = [`📑 <b>Sizning sheetlaringiz (${sheets.length}):</b>\n`];
    sheets.forEach((s, i) => {
      const label = SHEET_STATUS_LABEL[s.status] || s.status;
      const title = s.title ? ` — ${escape(s.title)}` : '';
      lines.push(
        `${i + 1}. <a href="${s.spreadsheetUrl}">Sheet</a>${title}\n   ${label}`
      );
      if (s.status === 'pending_verification') {
        lines.push(`   ↪︎ /verify_${s.id} — FB ulanishini tekshirish`);
      }
      if (s.status === 'error' && s.errorReason) {
        lines.push(`   ↪︎ Xato: <code>${escape(s.errorReason)}</code>`);
      }
    });
    return lines.join('\n');
  },

  sheetNotFound: `❌ Sheet topilmadi yoki sizga tegishli emas.`,

  // ============================================================
  // Status & utility
  // ============================================================

  /**
   * /status — foydalanuvchi holati.
   * userInfo: { user, sheets, isActive }
   */
  status: ({ user, sheets, isActive }) => {
    const lines = [`📊 <b>Sizning holatingiz</b>\n`];
    lines.push(`👤 <b>Ism:</b> ${user.firstName || '—'}`);
    lines.push(`📱 <b>Telefon:</b> ${user.phone || '—'}`);
    lines.push(`📧 <b>Gmail:</b> ${user.gmail || '—'}`);
    lines.push(`💬 <b>Guruh ID:</b> ${user.groupId || '—'}`);

    const verified = sheets.filter((s) => s.status === 'verified').length;
    const pending = sheets.filter((s) => s.status === 'pending_verification').length;
    const errored = sheets.filter((s) => s.status === 'error').length;
    lines.push(
      `📑 <b>Sheetlar:</b> ${sheets.length} ta (✅ ${verified} · ⏳ ${pending} · ❌ ${errored})`
    );

    lines.push('');
    if (isActive) {
      lines.push(`✅ <b>Tizim faol.</b>`);
    } else if (user.status !== 'ready') {
      lines.push(`⏳ Profile sozlanmoqda: <code>${user.status}</code>`);
    } else if (verified === 0) {
      lines.push(`⚠️ Hech qanday verified sheet yo'q. /sheets bosing.`);
    } else if (!user.groupId) {
      lines.push(`⚠️ Guruh ulanmagan. Meni guruhga qo'shing.`);
    }
    return lines.join('\n');
  },

  reset: `🔄 Hamma sozlamalar tozalandi. Qayta boshlash uchun /start bosing.`,

  unknownCommand: `Buyruqni tushunmadim. /help dan foydalaning.`,

  help:
    `<b>Lead Bridge — buyruqlar:</b>\n\n` +
    `/start — sozlashni boshlash yoki davom ettirish\n` +
    `/status — joriy holatni ko'rish\n` +
    `/sheets — barcha sheetlaringiz ro'yxati\n` +
    `/newsheet — yangi Google Sheet yaratish\n` +
    `/changegroup — Telegram guruhini o'zgartirish\n` +
    `/reset — hamma narsani qayta boshlash\n` +
    `/help — yordam`,

  errorGeneric: `❌ Xatolik yuz berdi. Birozdan keyin qaytadan urining.`,
};

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
