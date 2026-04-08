const { normalizeLanguage } = require('./i18n');

const SHEET_STATUS_LABELS = {
  uz: {
    pending_verification: "⏳ Ulanish tekshirilishi kutilmoqda",
    verified: '✅ Faol',
    error: '❌ Xato',
  },
  ru: {
    pending_verification: '⏳ Ждет проверки подключения',
    verified: '✅ Активен',
    error: '❌ Ошибка',
  },
};

const COPY = {
  uz: {
    welcome: (name) =>
      `👋 Salom${name ? `, <b>${escape(name)}</b>` : ''}!\n\n` +
      `🤖 Men <b>Lead Bridge</b> botiman. Facebook va Instagram reklamalaridan tushgan leadlarni yig'ib, kerakli Telegram guruhingizga tartibli qilib olib boraman.\n\n` +
      `🛠 Sozlash juda oson:\n` +
      `1️⃣ 📱 Telefon raqamingizni yuborasiz\n` +
      `2️⃣ 📧 Gmail manzilingizni tanlaysiz\n` +
      `3️⃣ 📊 Men sizga sheet tayyorlab beraman\n` +
      `4️⃣ 💬 Botni guruhga qo'shasiz\n\n` +
      `🚀 Hammasi tayyor bo'lsa, leadlar guruhga o'z vaqtida tushib turadi.`,
    mainMenuHint:
      `🏠 Asosiy menyu. Pastdagi tugmalardan foydalaning:\n\n` +
      `📋 <b>Sheetlarim</b> — sheetlar ro'yxati va statusi\n` +
      `🆕 <b>Yangi sheet</b> — yangi sheet qo'shish\n` +
      `⚙️ <b>Sozlamalar</b> — til, holat, yordam`,
    settingsMenuHint:
      `⚙️ Sozlamalar.\n\n` +
      `🌐 <b>Til</b> — interfeys tilini tanlash\n` +
      `📊 <b>Holatim</b> — joriy holatingiz\n` +
      `❓ <b>Yordam</b> — qo'llab-quvvatlash`,
    languageMenuHint:
      `🌐 Tilni tanlang. Pastdagi tugmalardan birini bosing.`,
    backToMain: `🏠 Asosiy menyuga qaytdik.`,
    backToSettings: `⚙️ Sozlamalarga qaytdik.`,
    cancelled: `❌ Bekor qilindi.`,
    askPhone:
      `📱 Telefon raqamingizni yuboring.\n\n` +
      `Pastdagi tugma orqali yuborsangiz, profilingizni to'g'ri bog'lab, keyingi qadamga o'tamiz. ➡️`,
    phoneSaved: (phone) =>
      `✅ Zo'r, raqam saqlandi: <code>${escape(phone)}</code>\n\n` +
      `📧 Endi Gmail manzilingizni tanlaymiz.`,
    askGmail:
      `📧 Gmail manzilingizni yuboring.\n\n` +
      `📊 Men Google Sheet tayyorlab, uni shu manzil bilan ulab beraman.\n\n` +
      `Masalan: <code>siz@gmail.com</code>`,
    askGmailWithPicker:
      `📧 Yangi sheet uchun qaysi Gmail akkountdan foydalanamiz?\n\n` +
      `👇 Pastdagi tugmalardan birini tanlang yoki <b>✍️ Yangi gmail</b> ni bosib, yangi manzilni xabarda yozing.\n\n` +
      `Format: <code>siz@gmail.com</code>`,
    typeNewGmail:
      `✍️ Yangi Gmail manzilni xabar qilib yuboring.\n\n` +
      `Format: <code>siz@gmail.com</code>`,
    askGroupForSheet: (sheetTitle) =>
      `Sheet <b>${escape(sheetTitle || '')}</b> tayyor.\n\n` +
      `Endi shu sheet leadlari qaysi guruhga tushishini tanlang. Eski guruhlaringizdan birini tanlasangiz ham bo'ladi, yoki yangi guruh ochib menga qo'shasiz.`,
    askGroupNoExisting: (sheetTitle) =>
      `Sheet <b>${escape(sheetTitle || '')}</b> tayyor.\n\n` +
      `Endi leadlar uchun guruh kerak. Yangi guruh oching va meni admin qilib qo'shing.`,
    newGroupInstructions: (sheetTitle) =>
      `Yangi guruh yarating va meni shu guruhga qo'shing, keyin admin qiling.\n\n` +
      `Men sizni kutib turaman — guruh qo'shilishi bilan <b>${escape(sheetTitle || '')}</b> sheet'iga avtomatik bog'layman.`,
    sheetGroupBound: (sheetTitle, groupTitle) =>
      `Sheet <b>${escape(sheetTitle || '')}</b> endi <b>${escape(groupTitle || '')}</b> guruhiga bog'landi.\n\n` +
      `Yangi leadlar shu guruhga tushadi.`,
    invalidGmail:
      `Bu Gmail manzilga o'xshamadi. Iltimos, <code>siz@gmail.com</code> ko'rinishida yuboring.`,
    creatingSheet: `Sheet tayyorlab beryapman, biroz kuting...`,
    newSheetCreating: `Yangi sheet tayyorlayapman, hozir bo'ladi...`,
    sheetCreated: (sheetUrl, isFirst = true) =>
      (isFirst
        ? `Sheet tayyor bo'ldi.\n\n`
        : `Yangi sheet tayyor.\n\n`) +
      `🔗 <a href="${sheetUrl}">Sheet'ni ochish</a>\n\n` +
      `Endi uni Facebook Lead Center bilan ulang:\n` +
      `1. <a href="https://business.facebook.com/latest/leads_center">Lead Center</a> ni oching\n` +
      `2. <b>Integrations</b> bo'limiga kiring\n` +
      `3. <b>Google Sheets</b> ni ulang\n` +
      `4. Shu sheet'ni tanlang\n` +
      `5. Hammasi ulanganidan keyin pastdagi tugmani bosing\n\n` +
      `Kerak bo'lsa rasmiy yo'riqnoma ham shu yerda: <a href="https://www.facebook.com/business/help/447834325474833">Facebook help</a>`,
    verifying: `Ulanishni tekshirib ko'ryapman...`,
    sheetVerifiedSuccess: (needsGroup) =>
      `Ajoyib, sheet ulandi.\n\n` +
      `Endi leadlar shu sheet orqali olinadi.\n\n` +
      (needsGroup
        ? `Keyingi qadam: meni guruhga qo'shing va admin qiling. Shunda yangi leadlar to'g'ridan-to'g'ri o'sha guruhga tushadi.`
        : `Hammasi joyida. /sheets orqali sheetlaringizni ko'rishingiz yoki /newsheet bilan yangisini qo'shishingiz mumkin.`),
    sheetVerifyFail: (missing) =>
      `Hali Facebook ustunlari topilmadi.\n\n` +
      `Topilmagan ustunlar:\n<code>${escape(missing.join(', '))}</code>\n\n` +
      `Lead Center'dagi ulanishni tekshirib, keyin yana urinib ko'ring.`,
    groupAdded: (groupTitle) =>
      `Zo'r, endi ishga tushdik.\n\n` +
      `Men <b>${groupTitle}</b> guruhiga ulanib oldim. Yangi leadlar shu yerga yuboriladi.`,
    groupAddedToChat: (firstName) =>
      `Salom, men <b>Lead Bridge</b>.\n\n` +
      `${firstName ? `<b>${escape(firstName)}</b>` : 'Egasi'} meni shu guruhga leadlarni yig'ish uchun qo'shdi. Endi yangi murojaatlar shu yerga kelib turadi.`,
    notAdmin:
      `Salom. Men hali bu guruhda admin emasman.\n\n` +
      `Menga xabar yuborish huquqini yoqsangiz, ishni davom ettiraman.`,
    notAdminDm: (groupTitle) =>
      `Men <b>${groupTitle}</b> guruhiga qo'shildim, lekin hali admin emasman.\n\n` +
      `Meni admin qilsangiz, leadlar shu zahoti guruhga bora boshlaydi.`,
    notAdminAlert: (count, groupTitle) =>
      `${count} ta yangi lead kutyapti.\n\n` +
      `Lekin men <b>${groupTitle}</b> guruhida admin emasman. Meni admin qilsangiz, yig'ilib qolgan leadlarning hammasini yuboraman.`,
    botPromoted: (groupTitle) =>
      `Rahmat, endi men <b>${groupTitle}</b> guruhida adminman.\n\n` +
      `Yangi leadlar odatdagidek kelib turadi.`,
    botDemoted: (groupTitle) =>
      `Meni <b>${groupTitle}</b> guruhida adminlikdan olishibdi.\n\n` +
      `Shu sabab leadlarni yubora olmayman. Qayta admin qilsangiz, davom etaman.`,
    alreadyBoundDm: (oldGroupId) =>
      `Sizda allaqachon ulangan guruh bor.\n\n` +
      `Joriy guruh ID: <code>${escape(oldGroupId)}</code>\n\n` +
      `Avval /changegroup orqali eski guruhni bo'shatib olaylik.`,
    alreadyBoundGroup:
      `Bu akkaunt allaqachon boshqa guruhga ulangan. Men bu yerdan chiqaman.`,
    changeGroupInstructions: (oldGroupId) =>
      `Guruhni almashtirish uchun avval eski guruhdan meni chiqarib yuboring.\n\n` +
      `Joriy guruh ID: <code>${escape(oldGroupId)}</code>\n\n` +
      `Shundan keyin meni yangi guruhga qo'shib, admin qilsangiz bo'ladi.`,
    changeGroupNoCurrent:
      `Hozircha sizda ulangan guruh yo'q.\n\n` +
      `Meni kerakli guruhga qo'shing va admin qiling.`,
    groupRemovedDm: (oldTitle) =>
      `Men <b>${oldTitle}</b> guruhidan chiqarildim.\n\n` +
      `Yangi guruhga ulashmoqchi bo'lsangiz, meni o'sha guruhga qo'shing va admin qiling.`,
    newSheetNotReady:
      `Avval boshlang'ich sozlashni tugataylik. /start ni bosing.`,
    sheetsEmpty:
      `Sizda hali sheet yo'q.\n\n` +
      `Yangi sheet kerak bo'lsa, /newsheet ni bosing.`,
    sheetsTitle: (count) => `Sizning sheetlaringiz: <b>${count}</b> ta\n`,
    verifyHint: (sheetId) => `/verify_${sheetId} — ulanishni tekshirish`,
    sheetError: (errorReason) => `Xato: <code>${escape(errorReason)}</code>`,
    sheetNotFound: `❓ Bu sheet topilmadi yoki sizga tegishli emas.`,
    confirmDeleteSheet: (sheetTitle) =>
      `🗑 <b>${escape(sheetTitle || '')}</b> sheet'ini o'chirmoqchimisiz?\n\n` +
      `⚠️ O'chirilgan sheet endi ko'rsatilmaydi va leadlar olinmaydi.\n\n` +
      `Tasdiqlash uchun pastdagi tugmani bosing.`,
    sheetDeleted: (sheetTitle) =>
      `🗑 Sheet <b>${escape(sheetTitle || '')}</b> o'chirildi.`,
    statusTitle: `Sizning holatingiz\n`,
    statusName: (value) => `👤 <b>Ism:</b> ${value || '—'}`,
    statusPhone: (value) => `📱 <b>Telefon:</b> ${value || '—'}`,
    statusGmail: (value) => `📧 <b>Gmail:</b> ${value || '—'}`,
    statusGroup: (value) => `💬 <b>Guruh ID:</b> ${value || '—'}`,
    statusLanguage: `🌐 <b>Til:</b> O'zbekcha`,
    statusMentions: (count) => `📣 <b>Story mention:</b> ${count} ta`,
    statusSheets: (all, verified, pending, errored) =>
      `📑 <b>Sheetlar:</b> ${all} ta (✅ ${verified} · ⏳ ${pending} · ❌ ${errored})`,
    statusActive: `Ishlayapti, hammasi joyida.`,
    statusProfilePending: (status) => `Profil hali yakunlanmagan: <code>${escape(status)}</code>`,
    statusNeedVerifiedSheet: `Hali tasdiqlangan sheet yo'q. /sheets ni ko'ring.`,
    statusNeedGroup: `Guruh ulanmagan. Meni guruhga qo'shing.`,
    help:
      `Yordam kerak bo'lsa, <a href="https://t.me/azadov_azamat">@azadov_azamat</a> bilan bog'laning.`,
    errorGeneric: `⚠️ Bir oz xatolik bo'ldi. Iltimos, qaytadan urinib ko'ring. 🔄`,
    notStarted: `Avval /start ni bosing.`,
    sendOwnContact: `Iltimos, aynan o'zingizning raqamingizni yuboring.`,
    chooseLanguage: `Tilni tanlang. Men keyingi xabarlarni shu tilda yuboraman.`,
    languageChanged: `Bo'ldi, endi shu tilda davom etaman.`,
    sheetCreateError: (errorMessage) =>
      `Sheet yaratishda muammo bo'ldi:\n<code>${escape(errorMessage)}</code>\n\nYana urinib ko'rish uchun /newsheet ni bosing.`,
    sheetIssue: (sheetUrl, errorMessage) =>
      `Sheet bilan bog'liq muammo chiqdi: <a href="${sheetUrl}">ochish</a>\n<code>${escape(errorMessage)}</code>\n\n/sheets orqali holatini ko'rishingiz mumkin.`,
    groupReconnectRequired:
      `Telegram guruh bilan aloqa uzildi. Meni guruhdan chiqarib, qayta qo'shing va admin qiling. /changegroup`,
    profileNotReadyForGroup:
      `Avval profilingizni tugatib, kamida bitta sheet'ni tasdiqlab oling. /start`,
    needVerifiedSheetForGroup:
      `Avval kamida bitta sheet'ni Facebook Lead Center bilan ulab tasdiqlang.\n\n/sheets — ro'yxat`,
    groupAlreadyClaimed:
      `Bu guruh allaqachon boshqa foydalanuvchiga ulangan. Iltimos, boshqa guruh tanlang.`,
    groupTitleFallback: 'guruh',
    storyMentionReplies: [
      (count) =>
        `Rahmat, story'da eslatib o'tganingiz juda yoqimli bo'ldi.\n\nBu sizning <b>${count}</b>-marta mention qilishingiz.`,
      (count) =>
        `Katta rahmat. Story'dagi e'tibor uchun minnatdormiz.\n\nHozirgacha siz bizni <b>${count}</b> marta mention qildingiz.`,
      (count) =>
        `Rahmat, bu mention biz uchun juda qadrli.\n\nStory mentionlar soni: <b>${count}</b>.`,
      (count) =>
        `Yaxshi gap va ishonch uchun rahmat.\n\nSizning mentionlaringiz soni allaqachon <b>${count}</b> taga yetdi.`,
    ],
  },
  ru: {
    welcome: (name) =>
      `👋 Здравствуйте${name ? `, <b>${escape(name)}</b>` : ''}!\n\n` +
      `🤖 Я <b>Lead Bridge</b>. Помогаю аккуратно собирать лиды из рекламы Facebook и Instagram и отправлять их в нужную Telegram-группу.\n\n` +
      `🛠 Настройка короткая:\n` +
      `1️⃣ 📱 Отправьте номер телефона\n` +
      `2️⃣ 📧 Выберите Gmail\n` +
      `3️⃣ 📊 Я подготовлю для вас sheet\n` +
      `4️⃣ 💬 Добавьте бота в группу\n\n` +
      `🚀 После этого новые лиды будут приходить в группу автоматически.`,
    mainMenuHint:
      `🏠 Главное меню. Используйте кнопки ниже:\n\n` +
      `📋 <b>Мои sheet</b> — список и статусы\n` +
      `🆕 <b>Новый sheet</b> — добавить новый sheet\n` +
      `⚙️ <b>Настройки</b> — язык, статус, помощь`,
    settingsMenuHint:
      `⚙️ Настройки.\n\n` +
      `🌐 <b>Язык</b> — выбор языка интерфейса\n` +
      `📊 <b>Мой статус</b> — текущее состояние\n` +
      `❓ <b>Помощь</b> — поддержка`,
    languageMenuHint:
      `🌐 Выберите язык. Нажмите одну из кнопок ниже.`,
    backToMain: `🏠 Вернулись в главное меню.`,
    backToSettings: `⚙️ Вернулись в настройки.`,
    cancelled: `❌ Отменено.`,
    askPhone:
      `📱 Отправьте ваш номер телефона.\n\n` +
      `Используйте кнопку ниже, чтобы я правильно привязал профиль и перешёл к следующему шагу. ➡️`,
    phoneSaved: (phone) =>
      `✅ Отлично, номер сохранил: <code>${escape(phone)}</code>\n\n` +
      `📧 Теперь выберем Gmail.`,
    askGmail:
      `📧 Отправьте ваш Gmail.\n\n` +
      `📊 Я подготовлю Google Sheet и открою к нему доступ на этот адрес.\n\n` +
      `Например: <code>you@gmail.com</code>`,
    askGmailWithPicker:
      `📧 Какой Gmail использовать для нового sheet?\n\n` +
      `👇 Выберите один из ваших прошлых аккаунтов или нажмите <b>✍️ Новый Gmail</b> и отправьте новый адрес сообщением.\n\n` +
      `Формат: <code>you@gmail.com</code>`,
    typeNewGmail:
      `✍️ Отправьте новый Gmail адрес сообщением.\n\n` +
      `Формат: <code>you@gmail.com</code>`,
    askGroupForSheet: (sheetTitle) =>
      `Sheet <b>${escape(sheetTitle || '')}</b> готов.\n\n` +
      `Теперь выберите, в какую группу будут приходить лиды этого sheet. Можно взять одну из ваших прошлых групп или создать новую и добавить меня туда.`,
    askGroupNoExisting: (sheetTitle) =>
      `Sheet <b>${escape(sheetTitle || '')}</b> готов.\n\n` +
      `Теперь нужна группа для лидов. Создайте новую группу и добавьте меня туда администратором.`,
    newGroupInstructions: (sheetTitle) =>
      `Создайте новую группу и добавьте меня в нее, затем выдайте права администратора.\n\n` +
      `Я подожду — как только меня добавят, автоматически привяжу группу к sheet'у <b>${escape(sheetTitle || '')}</b>.`,
    sheetGroupBound: (sheetTitle, groupTitle) =>
      `Sheet <b>${escape(sheetTitle || '')}</b> теперь привязан к группе <b>${escape(groupTitle || '')}</b>.\n\n` +
      `Новые лиды будут приходить туда.`,
    invalidGmail:
      `Похоже, это не Gmail. Отправьте адрес в формате <code>you@gmail.com</code>.`,
    creatingSheet: `Готовлю sheet, это займет совсем немного времени...`,
    newSheetCreating: `Создаю новый sheet, минутку...`,
    sheetCreated: (sheetUrl, isFirst = true) =>
      (isFirst
        ? `Sheet готов.\n\n`
        : `Новый sheet готов.\n\n`) +
      `🔗 <a href="${sheetUrl}">Открыть sheet</a>\n\n` +
      `Теперь подключите его в Facebook Lead Center:\n` +
      `1. Откройте <a href="https://business.facebook.com/latest/leads_center">Lead Center</a>\n` +
      `2. Зайдите в раздел <b>Integrations</b>\n` +
      `3. Подключите <b>Google Sheets</b>\n` +
      `4. Выберите этот sheet\n` +
      `5. После подключения нажмите кнопку ниже\n\n` +
      `Если понадобится, вот официальная инструкция: <a href="https://www.facebook.com/business/help/447834325474833">Facebook help</a>`,
    verifying: `Проверяю подключение...`,
    sheetVerifiedSuccess: (needsGroup) =>
      `Отлично, sheet подключен.\n\n` +
      `Теперь лиды будут приходить через него.\n\n` +
      (needsGroup
        ? `Следующий шаг: добавьте меня в группу и выдайте права администратора. Тогда новые лиды будут сразу приходить туда.`
        : `Все в порядке. Через /sheets можно посмотреть ваши sheet'ы, а через /newsheet добавить новый.`),
    sheetVerifyFail: (missing) =>
      `Пока не вижу обязательные поля Facebook.\n\n` +
      `Не найдены столбцы:\n<code>${escape(missing.join(', '))}</code>\n\n` +
      `Проверьте подключение в Lead Center и попробуйте еще раз.`,
    groupAdded: (groupTitle) =>
      `Отлично, все подключено.\n\n` +
      `Я уже в группе <b>${groupTitle}</b>. Новые лиды буду отправлять именно туда.`,
    groupAddedToChat: (firstName) =>
      `Салом, я <b>Lead Bridge</b>.\n\n` +
      `${firstName ? `<b>${escape(firstName)}</b>` : 'Владелец'} добавил меня в эту группу, чтобы новые лиды приходили сюда автоматически.`,
    notAdmin:
      `Салом. У меня пока нет прав администратора в этой группе.\n\n` +
      `Дайте мне право отправлять сообщения, и я продолжу работу.`,
    notAdminDm: (groupTitle) =>
      `Я уже добавлен в группу <b>${groupTitle}</b>, но пока не администратор.\n\n` +
      `Как только выдадите права администратора, начну отправлять лиды в группу.`,
    notAdminAlert: (count, groupTitle) =>
      `У вас уже накопилось <b>${count}</b> новых лидов.\n\n` +
      `Но в группе <b>${groupTitle}</b> я пока не администратор. Дайте права, и я сразу отправлю все накопившиеся лиды.`,
    botPromoted: (groupTitle) =>
      `Спасибо, теперь я администратор в группе <b>${groupTitle}</b>.\n\n` +
      `Новые лиды снова будут приходить автоматически.`,
    botDemoted: (groupTitle) =>
      `В группе <b>${groupTitle}</b> у меня больше нет прав администратора.\n\n` +
      `Из-за этого я не смогу отправлять лиды, пока права не вернут.`,
    alreadyBoundDm: (oldGroupId) =>
      `У вас уже есть привязанная группа.\n\n` +
      `Текущий ID группы: <code>${escape(oldGroupId)}</code>\n\n` +
      `Сначала освободим старую через /changegroup.`,
    alreadyBoundGroup:
      `Этот аккаунт уже привязан к другой группе. Я выйду из этого чата.`,
    changeGroupInstructions: (oldGroupId) =>
      `Чтобы сменить группу, сначала удалите меня из старой.\n\n` +
      `Текущий ID группы: <code>${escape(oldGroupId)}</code>\n\n` +
      `После этого добавьте меня в новую группу и выдайте права администратора.`,
    changeGroupNoCurrent:
      `Сейчас у вас нет привязанной группы.\n\n` +
      `Просто добавьте меня в нужную группу и сделайте администратором.`,
    groupRemovedDm: (oldTitle) =>
      `Меня удалили из группы <b>${oldTitle}</b>.\n\n` +
      `Если хотите подключить новую группу, добавьте меня туда и выдайте права администратора.`,
    newSheetNotReady:
      `Сначала давайте закончим начальную настройку. Нажмите /start.`,
    sheetsEmpty:
      `У вас пока нет ни одного sheet.\n\n` +
      `Если нужен новый, нажмите /newsheet.`,
    sheetsTitle: (count) => `Ваши sheet'ы: <b>${count}</b>\n`,
    verifyHint: (sheetId) => `/verify_${sheetId} — проверить подключение`,
    sheetError: (errorReason) => `Ошибка: <code>${escape(errorReason)}</code>`,
    sheetNotFound: `Этот sheet не найден или не принадлежит вам.`,
    statusTitle: `Ваш текущий статус\n`,
    statusName: (value) => `👤 <b>Имя:</b> ${value || '—'}`,
    statusPhone: (value) => `📱 <b>Телефон:</b> ${value || '—'}`,
    statusGmail: (value) => `📧 <b>Gmail:</b> ${value || '—'}`,
    statusGroup: (value) => `💬 <b>ID группы:</b> ${value || '—'}`,
    statusLanguage: `🌐 <b>Язык:</b> Русский`,
    statusMentions: (count) => `📣 <b>Упоминания в story:</b> ${count}`,
    statusSheets: (all, verified, pending, errored) =>
      `📑 <b>Sheet'ы:</b> ${all} (✅ ${verified} · ⏳ ${pending} · ❌ ${errored})`,
    statusActive: `Все работает как нужно.`,
    statusProfilePending: (status) => `Профиль еще не завершен: <code>${escape(status)}</code>`,
    statusNeedVerifiedSheet: `Пока нет ни одного подтвержденного sheet. Откройте /sheets.`,
    statusNeedGroup: `Группа еще не подключена. Добавьте меня в группу.`,
    help:
      `Если понадобится помощь, напишите <a href="https://t.me/azadov_azamat">@azadov_azamat</a>.`,
    errorGeneric: `⚠️ Что-то пошло не так. Попробуйте еще раз, пожалуйста. 🔄`,
    notStarted: `Сначала нажмите /start.`,
    sendOwnContact: `Пожалуйста, отправьте именно свой номер.`,
    chooseLanguage: `Выберите язык. Следующие сообщения буду отправлять на нем.`,
    languageChanged: `Готово, продолжаем на этом языке.`,
    sheetCreateError: (errorMessage) =>
      `Не получилось создать sheet:\n<code>${escape(errorMessage)}</code>\n\nПопробуйте снова через /newsheet.`,
    sheetIssue: (sheetUrl, errorMessage) =>
      `Возникла проблема со sheet: <a href="${sheetUrl}">открыть</a>\n<code>${escape(errorMessage)}</code>\n\nСтатус можно посмотреть через /sheets.`,
    groupReconnectRequired:
      `Связь с Telegram-группой потерялась. Удалите меня из группы, добавьте заново и выдайте права администратора. /changegroup`,
    profileNotReadyForGroup:
      `Сначала завершите профиль и подтвердите хотя бы один sheet. /start`,
    needVerifiedSheetForGroup:
      `Сначала подключите хотя бы один sheet к Facebook Lead Center и подтвердите его.\n\n/sheets — список`,
    groupAlreadyClaimed:
      `Эта группа уже привязана к другому пользователю. Пожалуйста, выберите другую группу.`,
    groupTitleFallback: 'группа',
    storyMentionReplies: [
      (count) =>
        `Спасибо за упоминание в story.\n\nЭто уже <b>${count}</b>-й раз, когда вы отмечаете нас.`,
      (count) =>
        `Очень приятно видеть нас в вашей story. Спасибо.\n\nВсего упоминаний от вас: <b>${count}</b>.`,
      (count) =>
        `Спасибо за поддержку и теплое упоминание.\n\nСчетчик ваших story mention уже на отметке <b>${count}</b>.`,
      (count) =>
        `Благодарим за story mention.\n\nВы уже отметили нас <b>${count}</b> раз.`,
    ],
  },
};

function forLanguage(language) {
  const lang = normalizeLanguage(language);
  const copy = COPY[lang];

  return {
    ...copy,
    language: lang,
    sheetsList: (sheets) => {
      if (sheets.length === 0) return copy.sheetsEmpty;

      const lines = [copy.sheetsTitle(sheets.length)];
      sheets.forEach((sheet, index) => {
        const label = SHEET_STATUS_LABELS[lang][sheet.status] || sheet.status;
        const title = sheet.title ? ` — ${escape(sheet.title)}` : '';
        lines.push(`${index + 1}. <a href="${sheet.spreadsheetUrl}">Sheet</a>${title}\n   ${label}`);
        if (sheet.gmail) {
          lines.push(`   📧 <code>${escape(sheet.gmail)}</code>`);
        }
        if (sheet.groupId) {
          const groupTitle = sheet.group?.title || `ID ${sheet.groupId}`;
          lines.push(`   💬 ${escape(groupTitle)}`);
        }
        if (sheet.status === 'pending_verification') {
          lines.push(`   ${copy.verifyHint(sheet.id)}`);
        }
        if (sheet.status === 'error' && sheet.errorReason) {
          lines.push(`   ${copy.sheetError(sheet.errorReason)}`);
        }
      });
      return lines.join('\n');
    },
    status: ({ user, sheets, isActive }) => {
      const lines = [copy.statusTitle];
      lines.push(copy.statusName(escape(user.firstName || '')));
      lines.push(copy.statusPhone(escape(user.phone || '')));
      lines.push(copy.statusLanguage);
      lines.push(copy.statusMentions(Number(user.mentionCount || 0)));

      const verified = sheets.filter((sheet) => sheet.status === 'verified').length;
      const pending = sheets.filter((sheet) => sheet.status === 'pending_verification').length;
      const errored = sheets.filter((sheet) => sheet.status === 'error').length;
      const withGroup = sheets.filter((sheet) => sheet.status === 'verified' && sheet.groupId).length;
      lines.push(copy.statusSheets(sheets.length, verified, pending, errored));
      lines.push('');

      if (isActive) {
        lines.push(copy.statusActive);
      } else if (user.status !== 'ready') {
        lines.push(copy.statusProfilePending(user.status));
      } else if (verified === 0) {
        lines.push(copy.statusNeedVerifiedSheet);
      } else if (withGroup === 0) {
        lines.push(copy.statusNeedGroup);
      }

      return lines.join('\n');
    },
    storyMentionReply: (count) => {
      const variants = copy.storyMentionReplies;
      return variants[Math.floor(Math.random() * variants.length)](count);
    },
  };
}

function escape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  forLanguage,
  escape,
};
