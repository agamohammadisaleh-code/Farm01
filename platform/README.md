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
- آزمون‌های یکپارچه بدون Docker اجرا می‌شوند و همان محدودیت‌های واقعی (مثلاً یکتایی `(cycle_id, date)`) را می‌سنجند.
- برای تولید فقط `PG_DRIVER=postgres` و `DATABASE_URL` لازم است؛ هیچ تغییری در کد نیست.

---

## احراز هویت و نقش‌ها

JWT کوتاه‌عمر (۱۵ دقیقه) + توکن تازه‌سازی چرخشی ۳۰ روزه (فقط هش آن ذخیره می‌شود). توکن، **مزرعه فعال** و نقش کاربر در همان مزرعه را حمل می‌کند.

| مجوز | مالک | مدیر | کارگر | دامپزشک |
|---|:--:|:--:|:--:|:--:|
| خواندن دوره‌ها و ثبت روزانه | ✅ | ✅ | ✅ | ✅ |
| ثبت/ویرایش آمار روزانه | ✅ | ✅ | ✅ | ✅ |
| ثبت دوره، هزینه و فروش | ✅ | ✅ | ❌ | ❌ |
| تنظیمات قیمت و اهداف | ✅ | ✅ | ❌ | ❌ |
| حذف دوره | ✅ | ❌ | ❌ | ❌ |
| مدیریت اعضا | ✅ | ❌ | ❌ | ❌ |

دلیل: داده مالی در عمل در اختیار مالک است؛ کارگر و دامپزشک شاخص‌های زیستی را می‌بینند ولی به هزینه و فروش دسترسی ندارند (حتی در پاسخ تحلیلی، فیلدهای مالی حذف می‌شوند).

---

## مدل داده

همه شناسه‌ها **UUID متنی** هستند. این انتخاب عمدی است: کلاینت آفلاین باید بتواند پیش از اتصال رکورد بسازد و هنگام همگام‌سازی همان شناسه را بفرستد؛ با شناسه خودافزا، همگام‌سازی نیازمند تبدیل شناسه و مدیریت تصادم می‌شد.

| جدول | نکته |
|---|---|
| `users`, `refresh_tokens` | گذرواژه با bcrypt، توکن تازه‌سازی با هش SHA-256 |
| `farms`, `farm_members`, `farm_settings` | چندمستأجری؛ نقش در جدول عضویت |
| `cycles` | `farm_id`، حذف نرم، `created_by` |
| `daily_logs` | ایندکس یکتای `(cycle_id, date)` + upsert اتمیک |
| `costs`, `sales` | `numeric` برای مبلغ؛ حذف نرم |
| `sync_receipts` | بی‌اثرکردن ارسال تکراری از کلاینت آفلاین |

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
GET    /cycles               POST  /cycles
GET    /cycles/:id           PATCH /cycles/:id        DELETE /cycles/:id
GET    /cycles/:id/stats
GET    /cycles/:id/logs      POST  /cycles/:id/logs   DELETE /cycles/:id/logs/:logId
GET    /cycles/:id/costs     POST  /cycles/:id/costs  PATCH|DELETE /cycles/:id/costs/:costId
GET    /cycles/:id/sales     POST  /cycles/:id/sales  DELETE /cycles/:id/sales/:saleId
GET    /analytics/overview   GET   /analytics/cycles/:id
GET    /health
```

خطاهای اعتبارسنجی به شکل `{ message, errors: { field: "پیام" } }` برمی‌گردند تا فرم‌های وب و موبایل مستقیم آن را نمایش دهند.

---

## آزمون‌ها

```bash
npm test          # ۲۶ تست دامنه + ۳۴ تست یکپارچه API
```

آزمون‌های API روی PGlite اجرا می‌شوند و این موارد را می‌سنجند: ثبت‌نام/ورود/چرخش توکن، ۴۰۱ بدون توکن، ماتریس RBAC (۴۰۳ برای کارگر روی هزینه)، upsert ثبت روزانه، رد تاریخ آینده و تلفات بیش از موجودی، محاسبه متریک و فیلتر شدن فیلدهای مالی برای کارگر، و جداسازی داده دو مزرعه.

> آزمون‌ها با `tsc` کامپایل و سپس با `node --test` اجرا می‌شوند؛ دلیل: `emitDecoratorMetadata` که DI نشات به آن وابسته است در esbuild/tsx پشتیبانی نمی‌شود و PGlite هم داخل VM جست قابل بارگذاری نیست.

### نتیجه انتقال داده واقعی

انتقال داده نمونه موجود (`data/farm.db`) به API جدید انجام و صحت آن بررسی شد:

| مورد | مقدار |
|---|---|
| دوره‌ها | ۳ (۲ فعال، ۱ بسته) |
| ثبت روزانه | ۹۶ |
| هزینه | ۴۲ از ۴۶ |
| فروش | ۲ |
| قطعه زنده | ۱۹٬۶۳۰ — دقیقاً برابر نسخه قدیمی |

**۴ هزینه منتقل نشد** چون تاریخشان آینده بود (۲۰۲۶-۱۰-۲۴ تا ۲۰۲۶-۱۱-۰۳). نسخه قدیمی اجازه ثبت تاریخ آینده می‌داد؛ API جدید آن را رد می‌کند. اسکریپت این موارد را گزارش می‌دهد و متوقف نمی‌شود.

اجرای دوباره اسکریپت **هیچ رکورد تکراری نمی‌سازد** (تطبیق دوره با نام + تاریخ جوجه‌ریزی، هزینه/فروش با شمارش چندتایی، ثبت روزانه با upsert).

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
