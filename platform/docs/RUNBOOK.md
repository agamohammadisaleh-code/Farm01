# راهنمای اجرا — قدم به قدم

این سند همان مسیری است که برای بالا آوردن کل سامانه از **صفر** طی می‌شود:
نصب، پایگاه داده، API، داشبورد وب، اپ موبایل، سرویس تحلیل، آزمون‌ها، مستندات و
استقرار. هر قدم **دستور** دارد، **خروجی مورد انتظار** دارد، و یک **نقطه بررسی**
که با آن مطمئن می‌شوید قدم درست انجام شده است.

> همه چیز در پوشه `platform/` است. دستورها از همین پوشه اجرا می‌شوند، مگر آن‌که
> خلافش نوشته شده باشد.

---

## ۰. نقشه‌ی اجزا و پورت‌ها

پیش از هر دستوری، بدانید چه چیزی قرار است کجا بالا بیاید:

| جزء | پوشه | پورت پیش‌فرض | نقش |
|---|---|---|---|
| بسته دامنه | `packages/domain` | — | محاسبات مشترک (FCR، هشدار، پیش‌بینی محلی). **پیش‌نیاز بقیه** |
| API | `apps/api` | `4000` | NestJS، JWT/RBAC، PostgreSQL/PGlite |
| داشبورد وب | `apps/web` | `5173` | React + Vite؛ `/api` را به API پروکسی می‌کند |
| اپ موبایل | `apps/mobile` | `8081` (Expo) | Expo/React Native، آفلاین‌فرست |
| سرویس تحلیل | `services/ai` | `8000` | FastAPI؛ اختیاری، نبودش API را نمی‌شکند |

نکته‌ی کلیدی معماری: **فقط API به پایگاه داده دسترسی دارد.** وب و موبایل هیچ
اتصال مستقیمی ندارند؛ وب از مسیر نسبی `/api/v1` (پروکسی Vite) و موبایل از
`expo.extra.apiUrl` استفاده می‌کند.

---

## ۱. پیش‌نیازها

| ابزار | نسخه لازم | بررسی |
|---|---|---|
| Node.js | ≥ ۲۰ (با ۲۲ آزموده شده) | `node -v` |
| npm | ≥ ۱۰ | `npm -v` |
| Python | ≥ ۳٫۱۰ (با ۳٫۱۱ آزموده شده) | `python3 --version` |
| Docker | اختیاری، فقط برای استقرار | `docker compose version` |

بررسی یک‌جا:

```bash
node -v && npm -v && python3 --version
```

خروجی واقعی محیط آزموده‌شده:

```
v22.22.3
10.9.8
Python 3.11.2
```

✅ **نقطه بررسی:** هر سه عدد چاپ شدند. اگر `node -v` کمتر از ۲۰ بود، ادامه
ندهید؛ برخی وابستگی‌ها (NestJS 11، Vite 6) روی نسخه‌های قدیمی بالا نمی‌آیند.

---

## ۲. گرفتن کد و نصب وابستگی‌ها

```bash
git clone <آدرس-مخزن> Farm01
cd Farm01/platform
npm ci
```

`npm ci` به‌جای `npm install` استفاده می‌شود تا **دقیقاً** همان نسخه‌های
`package-lock.json` نصب شوند (قابل تکرار در CI و روی ماشین همکار).

خروجی واقعی: نصب کامل در حدود **۲۳ ثانیه** (۹۲۶ بسته، شامل ورک‌اسپیس‌های
`apps/*` و `packages/*`).

اگر `npm ci` در دسترس نبود:

```bash
npm install --no-audit --no-fund
```

✅ **نقطه بررسی:**

```bash
ls node_modules/.bin | grep -c vite      # ≥ ۱
ls node_modules/vazirmatn/fonts/ttf/Vazirmatn-Regular.ttf
```

اگر فونت چاپ نشد، بسته `vazirmatn` نصب نشده و گزارش PDF فارسی بی‌ریخت می‌شود.

---

## ۳. متغیرهای محیطی

یک فایل `.env` از نمونه بسازید و مقادیر را ببینید:

```bash
cp .env.example .env
```

برای **توسعه محلی** تقریباً همه‌چیز پیش‌فرض درست است. فقط این‌ها اهمیت دارند:

| متغیر | پیش‌فرض | چه‌وقت تغییر می‌دهید |
|---|---|---|
| `PORT` | `4000` | وقتی ۴۰۰۰ اشغال است |
| `PG_DRIVER` | `postgres` در `.env.example` | برای توسعه بدون Postgres، `PGLITE_DATA_DIR` را تنظیم کنید (پایین) |
| `DATABASE_URL` | `postgres://farm:farm@localhost:5432/farm` | فقط با Postgres واقعی |
| `PGLITE_DATA_DIR` | `memory://` | `./.pgdata` برای داده پایدار روی دیسک |
| `JWT_SECRET` | نمونه | **در تولید الزامی**؛ تولید با مقدار نمونه بالا نمی‌آید |
| `CORS_ORIGINS` | `http://localhost:3000` | آدرس داشبورد؛ چند مقدار با کاما |
| `REDIS_URL` | `redis://localhost:6379` | برای شمارنده نرخ مشترک؛ نبودش خطا نیست |
| `AI_URL` | `http://localhost:8000` | آدرس سرویس تحلیل |
| `RATE_LIMIT_GLOBAL_MAX` | `1200` | سقف کلی هر نشانی در دقیقه |

نکته‌ی مهم: `.env` **خودکار** خوانده نمی‌شود؛ `ConfigModule` فایل `.env` را از
ریشه‌ی اجرا می‌خواند. ساده‌ترین راه، صادرکردن متغیرها در همان ترمینال است
(همان کاری که در قدم‌های بعد می‌کنیم) یا استفاده از Docker Compose (قدم ۱۲).

⚠️ اگر `.env.example` را عیناً کپی کردید، `PG_DRIVER=postgres` فعال است و به
یک Postgres واقعی نیاز دارید. برای توسعه‌ی سریع بدون نصب Postgres، آن خط را
کامنت کنید و `PGLITE_DATA_DIR` بدهید — دقیقاً مثل قدم ۴.

---

## ۴. ساخت بسته دامنه (پیش‌نیاز پنهان)

API و وب، `@farm/domain` را از **خروجی ساخته‌شده** می‌خوانند، نه از سورس. اگر
این قدم را رد کنید، خطای `Cannot find module '@farm/domain'` می‌گیرید:

```bash
npm run build:domain
```

خروجی واقعی: حدود **۲ ثانیه**، بدون پیام اضافه.

✅ **نقطه بررسی:**

```bash
ls packages/domain/dist/index.js && node -e "console.log(Object.keys(require('./packages/domain/dist')).length, 'export')"
```

---

## ۵. پایگاه داده: مهاجرت و داده نمونه

### گزینه الف) PGlite — توسعه و آزمون، بدون نصب چیزی

PGlite همان PostgreSQL است که به WASM کامپایل شده؛ همان `numeric`، همان
`timestamptz`، همان ایندکس یکتا و `ON CONFLICT`. فقط یک نویسنده درون فرایند
دارد و برای تولید مناسب نیست.

```bash
export PGLITE_DATA_DIR=./.pgdata      # memory:// هم می‌شود؛ ولی با ری‌استارت پاک می‌شود
npm run db:migrate
```

خروجی واقعی:

```
[Database] PGlite (./.pgdata) — مناسب توسعه و تست
مهاجرت‌های اجراشده: 0001_init.sql, 0002_model_v2.sql, 0003_operations.sql, 0004_alert_thresholds.sql
```

مهاجرت‌ها **بی‌اثر تکرارپذیر** (idempotent) هستند و در جدول `_migrations`
ثبت می‌شوند؛ اجرای دوباره چیزی را خراب نمی‌کند:

```bash
npm run db:migrate      # بار دوم: «مهاجرت جدیدی نبود.»
```

سپس داده نمونه (یک مزرعه، دو سالن، گله فعال ۱۲٬۰۰۰ قطعه‌ای با ۲۸ روز ثبت):

```bash
npm run db:seed
```

خروجی واقعی:

```
[Seed] داده نمونه ساخته شد: owner@farm.ir / Secret1234 (امروز 2026-10-24)
```

### گزینه ب) PostgreSQL واقعی

```bash
docker compose up -d postgres
export PG_DRIVER=postgres
export DATABASE_URL=postgres://farm:farm@localhost:5432/farm
npm run db:migrate && npm run db:seed
```

### بازنشانی کامل داده (شروع از صفر)

```bash
rm -rf .pgdata          # PGlite: فقط پوشه داده
npm run db:migrate && npm run db:seed
```

برای Postgres: `docker compose down -v` حجم داده را پاک می‌کند.

✅ **نقطه بررسی:** دستور زیر باید ۱۵ جدول دامنه + جدول فنی را نشان دهد:

```bash
npm run docs:schema && grep -c "CREATE TABLE" docs/architecture/schema.sql
```

---

## ۶. اجرای API

### حالت توسعه (ری‌استارت خودکار)

```bash
export PORT=4000
npm run dev:api
```

### حالت تولیدمانند (بیلد + اجرا)

```bash
npm run build:api
PORT=4000 node apps/api/dist/main.js
```

خروجی واقعی (خلاصه‌ی لاگ بالا آمدن):

```
[Database] PGlite (./.pgdata) — مناسب توسعه و تست
[NestApplication] Nest application successfully started
[Bootstrap] API روی http://0.0.0.0:4000/api/v1 (درایور: pglite)
```

✅ **نقطه بررسی ۱ — سلامت:**

```bash
curl -s http://127.0.0.1:4000/api/v1/health
```

```json
{"status":"ok","service":"farm-api","time":"2026-10-24T05:19:24.192Z"}
```

✅ **نقطه بررسی ۲ — ورود و توکن:**

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@farm.ir","password":"Secret1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
echo "${TOKEN:0:20}…"
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4000/api/v1/farm
```

✅ **نقطه بررسی ۳ — سند تعاملی API:** مرورگر → `http://localhost:4000/api/docs`
(JSON خام: `/api/docs-json`).

✅ **نقطه بررسی ۴ — نگهبان امنیتی زنده است:**

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code} " -X POST http://127.0.0.1:4000/api/v1/auth/login \
    -H "Content-Type: application/json" -d '{"email":"ghost@farm.ir","password":"WrongPass1"}'
done; echo
```

خروجی واقعی: `401 401 401 401 401 429` — تلاش ششم با سقف نرخ بسته می‌شود و
هدر `Retry-After: 300` برمی‌گردد. برای آزمون دستی بعدی، سرور را ری‌استارت کنید
یا `RATE_LIMIT_DISABLED=1` بدهید.

---

## ۷. اجرای داشبورد وب

در ترمینال دوم (API باید بالا باشد):

```bash
cd Farm01/platform
VITE_API_TARGET=http://127.0.0.1:4000 npm run dev:web
```

خروجی واقعی:

```
VITE v6.4.5  ready in 144 ms
➜  Local:   http://localhost:5173/
➜  Network: http://169.254.0.21:5173/
```

مرورگر → `http://localhost:5173` و ورود با `owner@farm.ir` / `Secret1234`.

نکته‌های این قدم:

- مرورگر **هرگز** به `localhost:4000` درخواست نمی‌زند؛ همه‌چیز نسبی (`/api/v1`)
  است و Vite پروکسی می‌کند. به همین دلیل نه CORS لازم است، نه آدرس API داخل
  باندل سخت می‌شود.
- اگر API روی پورت دیگری است، همان را در `VITE_API_TARGET` بگذارید.
- در محیط پیش‌نمایش/سندباکس، دامنه‌های میزبان در `server.allowedHosts` باز
  هستند؛ در شبکه‌ی بسته اگر صفحه سفید ماند، این کلید و `host: "0.0.0.0"` را
  بررسی کنید.

✅ **نقطه بررسی:** ورود انجام می‌شود و داشبورد با چهار KPI می‌آید؛ تب «امروز»
هم برای نقش‌های دیگر (کارگر/دامپزشک) باز است.

---

## ۸. اجرای سرویس تحلیل (اختیاری ولی ارزشمند)

```bash
cd services/ai
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

خروجی واقعی `GET /health`:

```json
{"status":"ok","service":"farm-ai","version":"0.2.0",
 "models":["gompertz-growth","breed-curves","disease-rules","early-warning-trends",
           "loading-optimizer","feed-forecast","speech-to-text(off)"]}
```

سپس API را با آدرس این سرویس بالا بیاورید (`AI_URL=http://127.0.0.1:8000`).

✅ **نقطه بررسی — API واقعاً از سرویس استفاده می‌کند:**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4000/api/v1/ai/status
```

```json
{"enabled":true,"available":true,"url":"http://127.0.0.1:8000","latencyMs":39,
 "models":["gompertz-growth", ...],"checkedAt":"2026-10-24T05:25:07.092Z"}
```

و پیش‌بینی گله:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:4000/api/v1/ai/flocks/<flockId>/forecast | head -c 200
```

```json
{"source":"ai","fallback":false,"projectedWeightGr":2306,"targetWeightGr":2450,"confidence":0.95,"method":"gompertz-fit"}
```

**آزمون مهم — رفتار بدون سرویس تحلیل:** سرویس را ببندید (Ctrl+C) و همان
درخواست را تکرار کنید. پاسخ باید `source: "local"` و `fallback: true` بدهد و
**هیچ خطایی** به کاربر نشان داده نشود. این تفاوت «هوش مصنوعی به‌عنوان بهبود» با
«هوش مصنوعی به‌عنوان تکیه‌گاه» است.

---

## ۹. اجرای اپ موبایل (Expo)

```bash
npm run build:domain          # اگر قبلاً نساخته‌اید
npm run typecheck:mobile      # بررسی نوع‌ها بدون نیاز به گوشی
npm run start:mobile          # Expo Dev Server
```

سپس یکی از این‌ها:

- گوشی واقعی: اپ **Expo Go** را نصب کنید و QR را اسکن کنید.
- اندروید امولاتور: `a` در ترمینال Expo.
- iOS (فقط macOS): `i`.

تنظیم آدرس API در `apps/mobile/app.json`:

```json
"extra": { "apiUrl": "http://192.168.1.20:4000", "aiUrl": "http://192.168.1.20:8000" }
```

⚠️ `localhost` روی گوشی به خودِ گوشی اشاره می‌کند، نه رایانه. IP رایانه در
شبکه محلی را بگذارید و مطمئن شوید هر دو یک Wi-Fi هستند. پیش‌فرض فایل روی
`http://localhost:4000` است (برای شبیه‌ساز در همان ماشین).

✅ **نقطه بررسی آفلاین (مهم‌ترین ویژگی این اپ):**

1. وارد شوید، یک ثبت روزانه بزنید — بدون اینترنت هم باید ذخیره شود.
2. Wi-Fi/داده را قطع کنید، چند ثبت دیگر بزنید؛ هیچ دکمه‌ای نباید غیرفعال شود.
3. اینترنت را وصل کنید؛ صف خودکار ارسال می‌شود.
4. همان ثبت را دوباره بفرستید (سناریوی قطع وسط ارسال): پاسخ باید
   `"status": "duplicate"` باشد، نه یک ردیف دوم.

آزمون سمت سرور، بدون گوشی:

```bash
curl -s -X POST http://127.0.0.1:4000/api/v1/sync/push \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"operations":[{"clientId":"test-op-0001","type":"daily_log","flockId":"<flockId>","payload":{"date":"2026-10-20","mortality":3,"feedKg":120}}]}'
```

ارسال دوباره‌ی همان بدنه، `duplicate` می‌دهد.

---

## ۱۰. آزمون‌ها و کیفیت کد

سه فرمان، سه لایه:

```bash
npm run typecheck       # strict TypeScript در دامنه، API و وب (≈۹ ثانیه)
npm run check:security  # قواعد RBAC/هش/اعتبارسنجی روی درخت کد
npm test                # ۹۹ دامنه + ۱۱۴ API + ۲۲ وب
npm run test:ai         # ۲۳ آزمون سرویس تحلیل (با venv سرویس)
```

خروجی واقعی:

```
✓ قواعد امنیتی برقرار است — 17 کنترلر، 74 مسیر، 2 استثنای مستند.
# tests 99   # pass 99   # fail 0
# tests 114  # pass 114  # fail 0
Tests  22 passed (22)
23 passed
```

آزمون API روی **PGlite در حافظه** اجرا می‌شود، پس به پایگاه داده بیرونی نیاز
ندارد و در CI هم سبز است.

برای دیدن این‌که نگهبان امنیتی واقعاً کار می‌کند (نه فقط سبز است): یک `@Roles`
را از یک مسیر بردارید، `npm run check:security` می‌شکند و نام همان مسیر را
چاپ می‌کند.

---

## ۱۱. مستندات و فایل یکجا

```bash
npm run docs:schema                  # DDL از پایگاه داده پس از مهاجرت‌ها
API_URL=http://127.0.0.1:4000 npm run docs:openapi   # از /api/docs-json
npm run docs:html                    # یک فایل HTML خودبسنده از کل سند
```

خروجی واقعی:

```
جدول‌ها: 16 · خطوط: 130
openapi.yaml نوشته شد — 54 مسیر، 29 schema
✓ farm-architecture.html نوشته شد — 560 کیلوبایت
```

فایل‌های تولیدشده در `docs/architecture/`:

| فایل | چیست |
|---|---|
| `README.md` | سند معماری هشت‌بخشی (دستی نوشته می‌شود) |
| `schema.sql` | DDL واقعی، تولیدشده |
| `openapi.yaml` | مشخصات API، تولیدشده از سرور در حال اجرا |
| `farm-architecture.html` | همه‌ی بالا در یک فایل، با فونت و تصویر درون‌فایل |

---

## ۱۲. استقرار با Docker Compose

```bash
cd platform
export JWT_SECRET=$(openssl rand -hex 32)      # الزامی؛ بدون آن بالا نمی‌آید
export CORS_ORIGINS=https://app.example.com    # فهرست دقیق، نه *
docker compose up -d --build
docker compose ps
```

چه چیزی بالا می‌آید: `postgres` (با healthcheck) → `redis` → `api` (مهاجرت‌ها را
خودکار اجرا می‌کند) → `ai`. سپس:

```bash
curl -s http://127.0.0.1:4000/api/v1/health
docker compose logs -f api
```

**قفل ایمنی تولید:** اگر `JWT_SECRET` نمونه/کوتاه باشد یا `CORS_ORIGINS` باز
باشد، برنامه به‌جای بالا آمدن ناامن، همان لحظه می‌شکند:

```
Error: پیکربندی ناامن برای تولید:
- JWT_SECRET تنظیم نشده یا کوتاه است (حداقل ۳۲ نویسه).
- CORS_ORIGINS در تولید باید فهرست دقیق دامنه‌ها باشد، نه خالی و نه *.
```

این پیام خطا نیست که دور بزنید؛ چک‌لیست تنظیمات است.

---

## ۱۳. عیب‌یابی — خطا، علت، درمان

| نشانه | علت | راه‌حل |
|---|---|---|
| `Cannot find module '@farm/domain'` | بسته دامنه ساخته نشده | `npm run build:domain` |
| `EADDRINUSE: 4000` | نمونه‌ی قبلی API زنده است | `lsof -ti:4000 \| xargs kill` یا `PORT=4001` |
| صفحه وب سفید، کنسول خطای ۴۰۴ | پروکسی به API اشتباه اشاره می‌کند | `VITE_API_TARGET` را درست کنید |
| `SQLITE_BUSY`/قفل PGlite | دو فرایند روی یک پوشه `PGLITE_DATA_DIR` | یکی را ببندید یا پوشه جدا بدهید |
| `پیکربندی ناامن برای تولید` | `NODE_ENV=production` با تنظیمات نمونه | `JWT_SECRET` ≥۳۲ نویسه و `CORS_ORIGINS` دقیق |
| `[Redis] Redis در دسترس نیست` | Redis بالا نیست (هشدار، نه خطا) | `docker compose up -d redis` یا نادیده بگیرید |
| ورود سریع با ۴۲۹ | سقف نرخ فعال شد | ۵ دقیقه صبر یا `RATE_LIMIT_DISABLED=1` در آزمون دستی |
| گزارش PDF با حروف شکسته | فونت وزیرمتن نصب/بارگیری نشده | `npm ci` و وجود `node_modules/vazirmatn` |
| `source: "local"` همیشه | `AI_URL` اشتباه یا سرویس خاموش | سرویس تحلیل را بالا بیاورید (قدم ۸) — این رفتار، خطا نیست |
| موبایل «خطای شبکه» می‌دهد | `apiUrl` روی `localhost` مانده | IP رایانه در `app.json` |
| آزمون API روی CI قرمز | بسته دامنه ساخته نشده | در CI هم `npm run build:domain` پیش از تست اجرا می‌شود |

---

## ۱۴. چک‌لیست «از صفر تا دمو» در ۱۰ دقیقه

```bash
# ۱) نصب (≈۲۵ ثانیه)
cd Farm01/platform && npm ci

# ۲) بسته دامنه (≈۲ ثانیه)
npm run build:domain

# ۳) پایگاه داده (≈۵ ثانیه)
export PGLITE_DATA_DIR=./.pgdata
npm run db:migrate && npm run db:seed

# ۴) API در ترمینال ۱
npm run dev:api

# ۵) داشبورد در ترمینال ۲
VITE_API_TARGET=http://127.0.0.1:4000 npm run dev:web

# ۶) سرویس تحلیل (اختیاری) در ترمینال ۳
cd services/ai && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- [ ] `curl http://127.0.0.1:4000/api/v1/health` → `{"status":"ok", ...}`
- [ ] ورود `owner@farm.ir` / `Secret1234` در `http://localhost:5173`
- [ ] داشبورد: چهار KPI + سه نمودار با داده واقعی
- [ ] `http://localhost:4000/api/docs` باز می‌شود
- [ ] `npm test` سبز (۹۹ + ۱۱۴ + ۲۲)
- [ ] `npm run check:security` سبز
- [ ] با خاموش‌کردن سرویس تحلیل، پیش‌بینی همچنان جواب می‌دهد (`fallback: true`)

---

## ۱۵. تمیزکاری

```bash
# بستن سرورهای محلی
lsof -ti:4000,5173,8000 | xargs -r kill

# پاک‌کردن داده توسعه
rm -rf .pgdata

# پاک‌کردن خروجی‌های ساخت
rm -rf apps/api/dist apps/api/dist-test packages/domain/dist apps/web/dist

# اگر Docker استفاده کردید
docker compose down          # داده‌ها می‌مانند
docker compose down -v       # داده‌ها هم پاک می‌شوند
```

---

## پیوست — دستورهایی که در CI اجرا می‌شوند

`.github/workflows/platform-ci.yml` دقیقاً همین ترتیب را روی هر Pull Request
اجرا می‌کند؛ پس اگر قدم‌های بالا روی ماشین شما سبز باشند، CI هم سبز است:

1. `npm ci`
2. `npm run build:domain`
3. `npm run typecheck`
4. `npm run typecheck:mobile`
5. `npm run check:security`
6. `npm test`
7. `npm run build:web`
8. (کار مستقل) `python -m pytest -q` در `services/ai`
