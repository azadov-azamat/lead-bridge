# lead-bridge

Self-serve Telegram bot: Facebook/Instagram Lead Ads → Google Sheet → Telegram guruh.

Foydalanuvchilar bot bilan suhbatda **4 qadamda** o'z lead oqimini sozlaydi — backend qolgan ishini avtomatik bajaradi.

---

## Ishlash mantig'i

```
User: /start
  ↓
Bot: Telefon, Gmail so'raydi
  ↓
Bot: User'ga Google Sheet yaratib beradi (default Google OAuth owner account orqali) va Gmail bilan share qiladi
  ↓
User: Sheet linkini Facebook Lead Center'ga ulaydi → "✅ Ulandim" bosadi
  ↓
Bot: Sheet headerlarini tekshiradi (form_id, ad_id, ... bormi?) — ulanishni tasdiqlaydi
  ↓
User: Botni o'z Telegram guruhiga qo'shadi
  ↓
Bot: my_chat_member event'i orqali avtomatik guruh ID'ni oladi va saqlaydi
  ↓
Poller: har 1 daqiqada barcha aktiv userlarning Sheet'larini tekshiradi
  ↓
Yangi leadlar avtomatik tegishli Telegram guruhga jo'natiladi
```

---

## Texnologiyalar

| Stack | Texnologiya |
|---|---|
| Bot | Telegraf.js |
| Sheet API | googleapis (OAuth refresh token yoki Service Account fallback) |
| DB | SQLite (better-sqlite3) |
| Scheduler | `setInterval` (ichki poller) |

---

## O'rnatish

### 1. Loyihani klonlash

```bash
git clone <repo> lead-bridge
cd lead-bridge
npm install
```

### 2. Telegram bot

1. [@BotFather](https://t.me/BotFather) → `/newbot` → tokenni oling
2. **MUHIM:** `/setprivacy` → **Disable** (bot guruhdagi xabarlarni ko'rishi uchun, ixtiyoriy)
3. `/setjoingroups` → **Enable** (botning guruhga qo'shilishiga ruxsat)

### 3. Google OAuth owner account

Tavsiya etilgan usul: bot bitta default Google account nomidan barcha userlar uchun Sheet yaratadi.

1. [Google Cloud Console](https://console.cloud.google.com/) → yangi project yarating
2. **APIs & Services → Library** → quyidagilarni yoqing:
   - **Google Sheets API**
   - **Google Drive API**
   - **Apps Script API**
3. **Google Auth Platform** ichida OAuth app yarating
4. `External` audience tanlang, o'zingizni `Test users` ga qo'shing
5. **Clients → Create client → Web application**
6. `Authorized redirect URI` sifatida `https://developers.google.com/oauthplayground` qo'shing
7. OAuth Playground orqali quyidagi scope'lar bilan `refresh token` oling:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/script.projects`

> `refresh token` maxfiy ma'lumot. Uni faqat `.env` da saqlang, screenshot yoki chatga tashlamang.

### 3.1 Service Account fallback

Eski `service account` usuli hali fallback sifatida qoldirilgan, lekin ko'p oddiy service account'larda `Google Drive storage quota = 0` bo'lgani uchun yangi Sheet yaratishda `The caller does not have permission` xatosi chiqadi.

### 4. `.env` sozlash

```bash
cp .env.example .env
```

`.env` faylida:

```env
TELEGRAM_BOT_TOKEN=xxxxx:yyyyyyyy
GOOGLE_AUTH_MODE=oauth
GOOGLE_OAUTH_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxxx
GOOGLE_OAUTH_REFRESH_TOKEN=xxxx
GOOGLE_OWNER_EMAIL=owner@gmail.com
GOOGLE_CREDENTIALS_PATH=./credentials/service-account.json
DATABASE_PATH=./data/lead-bridge.db
POLL_INTERVAL_MS=60000
ADMIN_TELEGRAM_ID=123456789
```

### 5. Ishga tushirish

```bash
npm start
```

yoki development rejimida (auto-reload):

```bash
npm run dev
```

---

## Foydalanuvchi tajribasi

1. **`/start`** → Botning xush kelibsiz xabari + "🚀 Boshlash" tugmasi
2. **Telefon raqami** → "📱 Raqamni yuborish" tugmasi orqali
3. **Gmail manzili** → matn formatida (validatsiya: `@gmail.com`)
4. **Sheet yaratiladi** → bot avtomatik Sheet yaratadi, Gmail'ga share qiladi, link beradi
5. **Facebook ulanish** → user yo'riqnoma bo'yicha Lead Center'da Sheet'ni ulaydi
6. **"✅ Ulandim" tugmasi** → bot Sheet headerlarini tekshiradi, ulanishni tasdiqlaydi
7. **Botni guruhga qo'shish** → user botni o'z guruhiga admin qilib qo'shadi
8. **Tayyor!** → bot avtomatik guruh ID'ni oladi va leadlarni jo'natishni boshlaydi

---

## Buyruqlar

| Buyruq | Tavsif |
|---|---|
| `/start` | Sozlashni boshlash yoki davom ettirish |
| `/status` | Joriy sozlamalarni ko'rish |
| `/reset` | Hammasini tozalab qaytadan boshlash |
| `/help` | Yordam |

---

## Loyiha strukturasi

```
lead-bridge/
├── src/
│   ├── index.js              # Entry point: bot + poller
│   ├── config.js             # .env o'qish
│   ├── db.js                 # SQLite schema va queries
│   ├── google.js             # Sheets/Drive API (create, verify, read)
│   ├── formatter.js          # Lead row → HTML xabar
│   ├── poller.js             # Har 1 daq Sheet'larni skanlovchi loop
│   └── bot/
│       ├── messages.js       # Barcha o'zbekcha matnlar
│       ├── keyboards.js      # Inline va reply tugmalar
│       ├── onboarding.js     # /start dan "done" gacha state machine
│       └── groupHandler.js   # my_chat_member → guruh ID avto-capture
├── credentials/
│   └── service-account.json  # Google service account (gitignored)
├── data/
│   └── lead-bridge.db        # SQLite (gitignored)
├── .env.example
├── .env                      # gitignored
├── package.json
└── README.md
```

---

## Database schema

### `users` jadvali

| Ustun | Tip | Tavsif |
|---|---|---|
| `telegram_id` | INTEGER PK | Telegram user ID |
| `username` | TEXT | @username |
| `first_name` | TEXT | Ism |
| `phone` | TEXT | Telefon raqami |
| `gmail` | TEXT | Gmail manzil (Sheet shu yerga share qilinadi) |
| `sheet_id` | TEXT | Yaratilgan Google Sheet ID |
| `sheet_url` | TEXT | Sheet URL |
| `group_id` | INTEGER | Telegram guruh ID |
| `status` | TEXT | Onboarding bosqichi (state machine) |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `users.status` qiymatlari

| Status | Ma'no |
|---|---|
| `new` | /start bosildi, hech narsa to'ldirilmagan |
| `awaiting_phone` | Telefon kutilmoqda |
| `awaiting_gmail` | Gmail kutilmoqda |
| `sheet_created` | Sheet yaratildi, Facebook ulanishi kutilmoqda |
| `fb_verified` | Facebook ulanishi tasdiqlandi, guruhga qo'shilish kutilmoqda |
| `done` | Hammasi tayyor — poller leadlarni jo'natadi |
| `error` | Telegram xatosi (bot guruhdan chiqarildi va h.k.) |

### `sent_leads` jadvali

Dedup uchun. `(telegram_id, lead_id)` PK — har bir lead aynan bir marta jo'natiladi.

---

## Production deploy

### PM2 bilan VPS'ga

```bash
npm install -g pm2
pm2 start src/index.js --name lead-bridge
pm2 save
pm2 startup
```

### Railway / Render / Fly.io

- Repo'ni ulang
- Environment variables'ni `.env`'dagi kabi sozlang
- `GOOGLE_CREDENTIALS_PATH` ni base64 sifatida saqlash uchun script kerak bo'lishi mumkin (yoki secret file mount)
- Persistent volume sozlang (`./data` SQLite uchun)

---

## Cheklovlar va keyingi qadamlar

- **Google API quota:** default `300 read/min/project`. 100+ user bo'lsa, polling intervalini oshirish yoki quota'ni oshirish kerak
- **Bitta user, bitta sheet, bitta guruh** — hozircha. Multi-sheet yoki multi-group support keyingi versiyalarda
- **Admin panel** yo'q — userlar ro'yxatini ko'rish uchun to'g'ridan-to'g'ri SQLite ochish kerak (`sqlite3 data/lead-bridge.db`)
- **Leadlarning kechikishi:** maksimum `POLL_INTERVAL_MS` (default 60 soniya)
- **Sheet'ni Facebook'ga ulash uchun** user o'z Google akkounti bilan login qilishi shart — bu ish botdan tashqarida bo'ladi
