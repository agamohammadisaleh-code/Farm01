# پلتفرم مرغ‌یار

پیاده‌سازی پشته فنی هدف: **NestJS + PostgreSQL + JWT/RBAC** برای API، بسته دامنه مشترک برای وب و موبایل، و کلاینت‌های React/Expo در فازهای بعد.

```
platform/
├── packages/domain/     منطق مشترک: محاسبات رشد/FCR/هزینه، تقویم شمسی، استانداردها (بدون فریم‌ورک)
├── apps/api/            NestJS + Drizzle + PostgreSQL (PGlite در توسعه) + JWT/RBAC
├── services/ai/         (فاز بعد) سرویس Python/FastAPI برای پیش‌بینی
├── apps/mobile/         (فاز بعد) React Native (Expo) با SQLite و همگام‌سازی
├── scripts/import-legacy.mjs  انتقال داده از نسخه SQLite
├── docker-compose.yml   postgres + redis + api
└── .env.example
```

---

## اجرا

```bash
cd platform
npm install
npm run build:domain

# توسعه: بدون نیاز به سرور PostgreSQL (PGlite)
npm run dev:api          # http://localhost:4000/api/v1  ·  مستندات: /api/docs

# تست و بررسی
npm test                 # دامنه + API
npm run typecheck
```

برای اجرای واقعی با PostgreSQL:

```bash
cp .env.example .env     # JWT_SECRET و DATABASE_URL را تنظیم کنید
docker compose up -d postgres redis
npm run db:migrate
npm run dev:api
```

---

## چرا PGlite در توسعه؟

این محیط سرور PostgreSQL ندارد. به‌جای جایگزین‌کردن SQLite (که رفتار numeric، date، ایندکس یکتا و `ON CONFLICT` را تغییر می‌دهد)، از **PGlite** استفاده می‌شود: همان موتور PostgreSQL کامپایل‌شده به WebAssembly که درون Node اجرا می‌شود. نتیجه:

- مهاجرت‌ها و کوئری‌ها همان SQL تولیدی هستند که در تولید اجرا می‌شود.
- آزمون‌های یکپارچه بدون Docker اجرا می‌شوند و همان محدودیت‌های واقعی (مثلاً یکتایی `(flock_id, date)`) را می‌سنجند.
- برای تولید فقط `PG_DRIVER=postgres` و `DATABASE_URL` لازم است؛ هیچ تغییری در کد نیست.

---

## احراز هویت و نقش‌ها

JWT کوتاه‌عمر (۱۵ دقیقه) + توکن تازه‌سازی چرخشی ۳۰ روزه (فقط هش آن ذخیره می‌شود). توکن، **مزرعه فعال** و نقش کاربر در همان مزرعه را حمل می‌کند.

| مجوز | مالک | مدیر | کارگر | دامپزشک |
|---|:--:|:--:|:--:|:--:|
| خواندن سالن‌ها، گله‌ها و ثبت روزانه | ✅ | ✅ | ✅ | ✅ |
| ثبت/ویرایش آمار روزانه و وزن‌گیری | ✅ | ✅ | ✅ | ✅ |
| ثبت گله، هزینه و فروش | ✅ | ✅ | ❌ | ❌ |
| واکسن و دارو | ✅ | ✅ | ❌ | ✅ |
| تنظیمات قیمت و اهداف | ✅ | ✅ | ❌ | ❌ |
| حذف گله | ✅ | ❌ | ❌ | ❌ |
| مدیریت اعضا | ✅ | ❌ | ❌ | ❌ |
| اصلاح موجودی انبار (تعیین قطعی) | ✅ | ✅ | ❌ | ❌ |
| گزارش مصرف دان (اصلاح افزایشی) | ✅ | ✅ | ✅ | ✅ |

دلیل: داده مالی در عمل در اختیار مالک است؛ کارگر و دامپزشک شاخص‌های زیستی را می‌بینند ولی به هزینه و فروش دسترسی ندارند (حتی در پاسخ تحلیلی، فیلدهای مالی حذف می‌شوند).

---

## مدل داده

مدل دقیقاً مطابق فهرست خواسته‌شده پیاده شده است:

```
Farm(id, name, location, owner_id)
 ├─ Hall(id, farm_id, name, capacity)
 │   └─ Flock(id, hall_id, breed, start_date, initial_count, status)
 │       ├─ DailyLog(id, flock_id, date, mortality, cull, feed_kg, water_liter, avg_temp, notes)
 │       ├─ WeightSample(id, flock_id, date, sample_count, avg_weight_gr)
 │       ├─ Vaccination(id, flock_id, name, scheduled_date, done_date, status)
 │       ├─ Medication(id, flock_id, name, dose, start_date, end_date)
 │       ├─ Expense(id, flock_id, category, amount, date, description)
 │       └─ Sale(id, flock_id, date, total_weight_kg, price_per_kg, buyer)
 ├─ FeedInventory(id, farm_id, feed_type, quantity_kg, updated_at)
 └─ User(id, name, phone, role(owner|manager|worker), farm_id)
```

همه شناسه‌ها **UUID متنی** هستند: کلاینت آفلاین باید پیش از اتصال رکورد بسازد و هنگام همگام‌سازی همان شناسه را بفرستد؛ با شناسه خودافزا، همگام‌سازی نیازمند تبدیل شناسه و مدیریت تصادم می‌شد.

### افزوده‌های عمدی نسبت به فهرست بالا

هر افزوده با دلیل آمده است و هیچ‌کدام جایگزین فیلدی از خواسته نیست:

| افزوده | چرا |
|---|---|
| `daily_logs.feed_type` | بدون آن، کسر خودکار از انبار به تفکیک نوع دان (آغازین/رشد/پایانی) ممکن نیست |
| `expenses.feed_type` | تا برگرداندن خرید در ویرایش/حذف، به همان ردیف انبار بخورد |
| `flocks.name`, `status`, `closed_date`, `chick_price`, `target_*` | نام و وضعیت گله برای فهرست و بستن گله؛ قیمت جوجه و هدف، ورودی محاسبات مالی و انحراف از استاندارد |
| `medications.withdrawal_days` | دوره پرهیز دارویی؛ بدون آن نمی‌توان پیش از فروش هشدار داد |
| `users.role = vet` | نقش دامپزشک (مجوز واکسن/دارو، بدون دسترسی مالی). نقش‌های خواسته‌شده دست‌نخورده‌اند |
| `farm_members`, `farm_settings`, `refresh_tokens`, `sync_receipts` | چندمزرعه‌ای بودن، تنظیمات قیمت/هدف/منطقه زمانی، چرخش توکن و بی‌اثرکردن ارسال تکراری آفلاین |
| `deleted_at` و `updated_at` در همه جدول‌ها | حذف نرم و همگام‌سازی افزایشی با موبایل |

### قواعد کلیدی

- `daily_logs` ایندکس یکتای `(flock_id, date)` دارد؛ `POST` همان روز، **upsert** می‌کند.
- `halls` یکتای `(farm_id, name)`؛ گله فقط در سالنِ همان مزرعه ساخته می‌شود و ظرفیت سالن کنترل می‌شود.
- دسترسی به هر منبع فرزند از مسیر `flock → hall → farm` بررسی می‌شود؛ UUID گله مزرعه دیگر ۴۰۴ می‌دهد.
- مبلغ‌ها `numeric(14,0)` (ریال، بدون اعشار) و وزن/مقدار `numeric(12,2)`.

### انبار دان یک «دفتر» است

موجودی افزایشی به‌روز می‌شود: خرید `+`، مصرف روزانه `−`، اصلاح دستی `±`؛ ویرایش یک ثبت روزانه ابتدا مقدار قبلی را برمی‌گرداند و بعد مقدار جدید را کسر می‌کند، پس هیچ‌گاه دوبار کسر نمی‌شود.

موجودی **منفی مجاز است** و معنی روشنی دارد: مصرفی ثبت شده که خریدِ هم‌نوعش ثبت نشده. بریدن آن به صفر باعث می‌شود انبار بیشتر از واقعیت نشان داده شود (انتقال داده قدیمی دقیقاً همین را آشکار کرد). کمبود در شاخص‌ها به‌صورت هشدار دیده می‌شود. تنها ورودی‌های انسانی (تعیین قطعی و اصلاح دستی) منفی نمی‌شوند.

---

## API

مسیر پایه: `/api/v1` — مستندات Swagger روی `/api/docs`.

```
POST   /auth/register | /auth/login | /auth/refresh | /auth/logout
GET    /auth/me
POST   /auth/switch-farm
GET    /farm                              اطلاعات مزرعه فعال
GET    /farm/settings        PATCH /farm/settings
GET    /farm/members         POST  /farm/members      DELETE /farm/members/:userId
POST   /farm                              ساخت مزرعه دوم برای همان کاربر
GET    /farm/inventory       POST  /farm/inventory          افزودن دان
POST   /farm/inventory/set   POST  /farm/inventory/adjust   تعیین قطعی | اصلاح ±
GET    /halls                POST  /halls
GET    /halls/:id            PATCH /halls/:id           DELETE /halls/:id
GET    /flocks               POST  /flocks
GET    /flocks/:id           PATCH /flocks/:id          DELETE /flocks/:id
GET    /flocks/:id/stats
GET    /flocks/:id/logs      POST  /flocks/:id/logs     DELETE /flocks/:id/logs/:logId
GET    /flocks/:id/weights   POST  /flocks/:id/weights  DELETE /flocks/:id/weights/:id
GET    /flocks/:id/vaccinations   POST /flocks/:id/vaccinations   PATCH|DELETE /flocks/:id/vaccinations/:id
GET    /flocks/:id/medications    POST /flocks/:id/medications    PATCH|DELETE /flocks/:id/medications/:id
GET    /flocks/:id/health
GET    /flocks/:id/expenses  POST  /flocks/:id/expenses  PATCH|DELETE /flocks/:id/expenses/:id
GET    /flocks/:id/sales     POST  /flocks/:id/sales     DELETE /flocks/:id/sales/:id
GET    /analytics/overview   GET   /analytics/flocks/:id
GET    /health
```

خطاهای اعتبارسنجی به شکل `{ message, errors: { field: "پیام" } }` برمی‌گردند تا فرم‌های وب و موبایل مستقیم آن را نمایش دهند.

---

## آزمون‌ها

```bash
npm test          # ۳۰ تست دامنه + ۵۵ تست یکپارچه API
```

آزمون‌های API روی PGlite اجرا می‌شوند و این موارد را می‌سنجند: ثبت‌نام/ورود/چرخش توکن، ۴۰۱ بدون توکن، ماتریس RBAC، upsert ثبت روزانه، رد تاریخ آینده و تلفات بیش از موجودی، ظرفیت سالن و رد سالن مزرعه دیگر، وزن‌گیری نمونه‌ای و استفاده از آن به‌عنوان منبع وزن، وضعیت مؤثر واکسن (شامل `overdue`)، دوره پرهیز دارو، و حسابداری انبار (خرید، کسر مصرف، ویرایش بدون کسر دوباره، منفی‌شدن در کمبود، رد اصلاح دستی منفی)، و جداسازی داده دو مزرعه.

> آزمون‌ها با `tsc` کامپایل و سپس با `node --test` اجرا می‌شوند؛ دلیل: `emitDecoratorMetadata` که DI نشات به آن وابسته است در esbuild/tsx پشتیبانی نمی‌شود و PGlite هم داخل VM جست قابل بارگذاری نیست.

### نتیجه انتقال داده واقعی

انتقال داده نمونه موجود (`data/farm.db`) به API جدید انجام و صحت آن بررسی شد:

| مورد | مقدار |
|---|---|
| گله‌ها | ۳ (۲ فعال، ۱ بسته) |
| سالن‌ها | ۳ (از ستون «سالن» هر گله ساخته شد) |
| ثبت روزانه | ۹۶ |
| وزن‌گیری | ۳۰ (از وزن‌های ثبت‌شده در لاگ قدیمی) |
| هزینه | ۴۲ از ۴۶ |
| فروش | ۲ |
| قطعه زنده | ۱۹٬۶۳۰ — دقیقاً برابر نسخه قدیمی |
| سود تحقق‌یافته | ۳۰۰٬۵۸۰٬۲۲۳ ریال — دقیقاً برابر نسخه قدیمی |
| انبار دان | ۱۰٬۹۶۰٫۶ + ۱۰٬۳۵۶٫۵ − ۲۶٬۰۱۹٫۱ = **−۴٬۷۰۲ کیلوگرم** = خرید ۸۹٬۶۱۹ − مصرف ۹۴٬۳۲۱ |

**۴ هزینه منتقل نشد** چون تاریخشان آینده بود (۲۰۲۶-۱۰-۲۴ تا ۲۰۲۶-۱۱-۰۳). نسخه قدیمی اجازه ثبت تاریخ آینده می‌داد؛ API جدید آن را رد می‌کند. اسکریپت این موارد را گزارش می‌دهد و متوقف نمی‌شود.

اجرای دوباره اسکریپت **هیچ رکورد تکراری نمی‌سازد** (تطبیق گله با نام + تاریخ شروع، هزینه/فروش با شمارش چندتایی، ثبت روزانه با upsert، وزن‌گیری با تاریخ).

موجودی منفیِ «دان پایانی» یک واقعیت داده است، نه باگ: در نسخه قدیمی مصرف دان پایانی ۵۰٬۲۲۳ کیلوگرم ثبت شده ولی خرید هم‌نوعش فقط ۲۴٬۲۰۴ کیلوگرم بوده. سیستم آن را پنهان نمی‌کند تا مالک بتواند خریدهای ثبت‌نشده را اصلاح کند.

### داده نمونه

```bash
npm run seed --workspace @farm/api              # ساخت (تکرارپذیر، شناسه ثابت)
SEED_RESET=1 npm run seed --workspace @farm/api # پاک‌سازی و ساخت دوباره
```

یک مزرعه با ۳ سالن و ۲ گله می‌سازد: ۲۷ روز ثبت روزانه، ۵ وزن‌گیری، واکسن انجام‌شده و عقب‌افتاده، دارو با دوره پرهیز، ۹ هزینه، یک فروش و انبار دان. ورود: `owner@farm.ir` / `Secret1234`.

---

## وضعیت فازها

| فاز | وضعیت |
|---|---|
| بسته دامنه مشترک | ✅ |
| API + PostgreSQL + JWT/RBAC + مهاجرت + تست | ✅ |
| انتقال داده از SQLite | ✅ اسکریپت آماده (`scripts/import-legacy.mjs`) |
| Redis (کش/صف) | ⏳ در compose تعریف شده، مصرف کد در فاز اعلان‌ها و صف همگام‌سازی |
| سرویس AI (FastAPI) | ⏳ فاز بعد |
| وب با Tailwind + Recharts | ⏳ فاز بعد (نسخه فعلی Next.js همچنان در ریشه مخزن کار می‌کند) |
| موبایل Expo + SQLite/WatermelonDB | ⏳ فاز بعد |
| ذخیره فایل S3 | ⏳ فاز بعد (گزارش‌ها و پیوست‌ها) |

تا زمانی که وب و موبایل جدید آماده نشوند، نسخه فعلی (Next.js + SQLite + PWA) در ریشه مخزن دست‌نخورده و قابل استفاده می‌ماند.
