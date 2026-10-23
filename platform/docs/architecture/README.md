# معماری مرغ‌یار

این سند هفت بخش دارد و **از خودِ کد تولید و بررسی می‌شود**، نه از حافظه:

| بخش | منبع |
|---|---|
| [۱. معماری کلی](#۱-معماری-کلی) | ساختار ورک‌اسپیس + کد ماژول‌ها |
| [۲. طرح پایگاه‌داده](#۲-طرح-پایگاه‌داده) | [`schema.sql`](./schema.sql) — از پایگاه‌داده واقعی پس از مهاجرت‌ها |
| [۳. ساختار پوشه‌ها](#۳-ساختار-پوشه‌ها) | درخت واقعی مخزن |
| [۴. کد سه ماژول کلیدی](#۴-کد-سه-ماژول-کلیدی) | `logs.service.ts`، `metrics.ts`، `services.py` |
| [۵. مشخصات API](#۵-مشخصات-api) | [`openapi.yaml`](./openapi.yaml) — از `/api/docs-json` |
| [۶. طرح صفحه](#۶-طرح-صفحه-wireframe-متنی) | کامپوننت‌های واقعی وب و موبایل |
| [۷. نقشه راه](#۷-نقشه-راه-فازبندی‌شده) | وضعیت فازها + کارهای باقی‌مانده |

بازتولید بخش‌های ماشینی:

```bash
npm run docs:schema                 # DDL از پایگاه‌داده پس از اجرای مهاجرت‌ها
API_URL=http://127.0.0.1:4000 npm run docs:openapi   # از سرور در حال اجرا
```

---

## ۱. معماری کلی

### نمودار لایه‌ها

> نمودار با فونت یکنواخت (monospace) رسم شده است؛ جای جعبه‌ها معنادار است،
> جهت خواندن هر ردیف از چپ به راست است. در رابط کاربری، همه‌چیز راست‌به‌چپ است.

```
                            ┌────────────────────────────────────────────┐
                            │                 کاربران                    │
                            │  مالک/مدیر (داشبورد) · کارگر (گوشی) · دامپزشک │
                            └───────────────┬────────────────────────────┘
                                            │
        ┌───────────────────┬───────────────┴────────────────┬──────────────────┐
        ▼                   ▼                                ▼                  ▼
┌───────────────┐  ┌────────────────┐              ┌─────────────────┐  ┌──────────────┐
│ apps/web      │  │ apps/mobile    │              │ docs/demo       │  │ گزارش‌ها      │
│ React + Vite  │  │ Expo + SQLite  │              │ صفحه نمایشی     │  │ Excel / PDF  │
│ Tailwind      │  │ آفلاین‌فرست     │              │ (فقط با فلگ)    │  │ (از API)     │
│ Recharts      │  │ صف همگام‌سازی   │              └─────────────────┘  └──────────────┘
└───────┬───────┘  └───────┬────────┘
        │  /api/v1 (نسبی)  │  /api/v1 + /sync/push + /sync/pull
        └──────────┬───────┘
                   ▼
        ┌──────────────────────────────┐        ┌────────────────────────────┐
        │  apps/api — NestJS 11        │        │ services/ai — FastAPI      │
        │  ─────────────────────────   │  HTTP  │ ─────────────────────────  │
        │  auth (JWT + RBAC)           │ ─────► │ منحنی نژاد · وزن پایان دوره │
        │  farms/halls/flocks          │ ◄───── │ تاریخ بهینه بارگیری         │
        │  logs · weights · expenses   │  JSON  │ هشدار زودهنگام بیماری       │
        │  sales · inventory           │        │ تبدیل گفتار (اختیاری)      │
        │  analytics · reminders       │        └────────────────────────────┘
        │  reports (xlsx/pdf)          │                     ▲
        │  assistant · sync            │                     │ اگر پاسخ نداد:
        └───────────┬──────────────────┘                     │ همان محاسبه در
                    │                                        │ بسته دامنه (TS)
                    ▼                                        │ با fallback:true
        ┌──────────────────────────────┐                     │
        │  packages/domain (TypeScript)│─────────────────────┘
        │  ─ بدون فریم‌ورک، بدون I/O ─ │
        │  استانداردها و منحنی نژاد     │
        │  محاسبات رشد/FCR/هزینه       │
        │  تقویم شمسی · قالب‌بندی فارسی  │
        │  ماتریس دسترسی نقش‌ها          │
        │  صف آفلاین · برنامه اعلان     │
        │  تجزیه جمله فارسی (دستیار)    │
        └───────────┬──────────────────┘
                    │ Drizzle ORM
                    ▼
        ┌──────────────────────────────┐   ┌─────────────┐   ┌──────────────┐
        │ PostgreSQL (PGlite در توسعه) │   │ Redis       │   │ S3           │
        │ ۱۵ جدول · مهاجرت SQL · تراکنش │   │ (فاز بعد)   │   │ (فاز بعد)    │
        └──────────────────────────────┘   └─────────────┘   └──────────────┘
```

### قانون‌های معماری (آنچه هرگز نقض نمی‌شود)

۱. **محاسبه یک‌جا، نمایش چندجا.** فرمول FCR، منحنی استاندارد نژاد، هزینه هر
کیلو، سهم تلفات مجاز و قواعد هشدار فقط در `packages/domain` نوشته شده‌اند.
API همان کد را اجرا می‌کند، وب و موبایل هم همان را برای نمایش/پیش‌بینی محلی
می‌خوانند. نتیجه: عدد داشبورد، عدد PDF و عدد گوشی هرگز با هم اختلاف ندارند.

۲. **API هرگز به سرویس AI وابسته نیست.** `apps/api` اول سرویس پایتون را با
مهلت کوتاه صدا می‌زند؛ اگر جواب نداد یا کند بود، همان محاسبه را با بسته دامنه
انجام می‌دهد و پاسخ را با `fallback: true` برمی‌گرداند. قطعی AI نباید ثبت
داده یا دیدن داشبورد را متوقف کند.

۳. **موبایل آفلاین‌فرست است.** نوشتن در SQLite گوشی «موفق» است؛ ارسال به
سرور کار پس‌زمینه است. صف عملیات idempotent است (`sync_receipts`) و تعارض با
`updated_at` و وضعیت «در صف» حل می‌شود.

۴. **دسترسی در سرور اعمال می‌شود، نه در رابط کاربری.** ماتریس نقش در بسته
دامنه است (تا موبایل آفلاین هم بداند)، اما تصمیم نهایی با `RolesGuard` در API
است و داده مالی برای نقش‌های بدون `cost:read` حتی از پاسخ حذف می‌شود.

۵. **داده حذف نمی‌شود، علامت می‌خورد.** `deleted_at` + `updated_at` در همه
جدول‌های عملیاتی؛ هم برای بازیابی، هم برای رساندن «حذف» به گوشی‌های دیگر.

### جریان چند درخواست نمونه

| سناریو | مسیر |
|---|---|
| داشبورد | `GET /analytics/overview` → خواندن ۵ جدول → `computeMetrics` در دامنه → JSON با ۶۷ فیلد شاخص برای هر گله |
| ثبت روزانه | `POST /flocks/:id/logs` → اعتبارسنجی (تاریخ آینده، تلفات > زنده، ظرفیت) → upsert یکتا روی (گله، تاریخ) + کسر انبار در همان تراکنش |
| ثبت آفلاین | گوشی: SQLite → صف → `POST /sync/push` (idempotent) → `GET /sync/pull?since=` → ادغام |
| پیش‌بینی وزن | `GET /ai/flocks/:id/forecast` → ساخت سری وزن‌ها از دامنه → FastAPI (گومپرتز/منحنی نژاد) → در صورت خطا/تأخیر: محاسبه محلی + `fallback:true` |
| گزارش | `GET /reports/flocks/:id/export?format=xlsx\|pdf` → همان متریک‌ها → ExcelJS/pdfkit با فونت RTL |
| دستیار فارسی | `POST /assistant/message` → تجزیه محلی (دامنه) → پیش‌نویس + `needsConfirmation` → `POST /assistant/confirm` → ثبت واقعی با RBAC |

---

## ۲. طرح پایگاه‌داده

فایل کامل و اجراپذیر: **[`schema.sql`](./schema.sql)** (از پایگاه‌داده‌ی واقعی
پس از اجرای چهار مهاجرت تولید شده است — نه دست‌نویس).

**۱۵ جدول دامنه** (به‌علاوه `_migrations` فنی) در چهار گروه:

| گروه | جدول‌ها | نکته کلیدی |
|---|---|---|
| هویت و دسترسی | `users`, `farms`, `farm_members`, `farm_settings`, `refresh_tokens` | نقش در `farm_members` است، نه `users`؛ یک کاربر می‌تواند در چند مزرعه نقش متفاوت داشته باشد |
| ساختار پرورش | `halls`, `flocks`, `daily_logs`, `weight_samples`, `vaccinations`, `medications` | `halls` جدول مستقل است (نه ستون متنی)؛ `weight_samples` جدول مستقل با یکنواختی/CV |
| عملیات و مالی | `expenses`, `sales`, `feed_inventory` | `feed_inventory` یک «دفتر» است: خرید و مصرف هر دو تراکنش ثبت می‌شوند |
| فنی | `sync_receipts` | رسید idempotency همگام‌سازی موبایل |

### تصمیم‌های مهم

**۱. واحد پول: تومان، بدون اعشار.** همه مبالغ `numeric(14,0)`؛ وزن‌ها و
کمیت‌ها `numeric(12,2)`. دلیل: ریال در عمل سه صفر اضافه و منبع خطای گزارش است.

**۲. یک ثبت روزانه برای هر (گله، تاریخ).** هم ایندکس یکتا، هم upsert سمت
سرور، هم کلید محلی گوشی (نه شناسه سرور) — تا «ثبت امروز دوباره» رکورد دوم نسازد.

**۳. حذف نرم + `updated_at` در همه جدول‌های عملیاتی.** ستون‌های
`deleted_at`/`updated_at` مبنای همگام‌سازی افزایشی (`since`) هستند.

**۴. `farm_settings` آستانه‌ها را نگه می‌دارد.** `daily_mortality_alert_pct`
(پیش‌فرض ۰٫۵)، `water_drop_alert_pct` (پیش‌فرض ۱۰)، قیمت بازار و دان،
`timezone`. هشدارها از همین‌ها ساخته می‌شوند و قابل تنظیم‌اند.

**۵. `sync_receipts` کلید اصلی امنیت داده آفلاین است.** برای هر عملیات
(`client_id`) یک ردیف؛ اگر همان عملیات دوباره برسد، پاسخ `duplicate` می‌گیرد.

**۶. کلیدهای خارجی با `ON DELETE CASCADE` برای داده فرزند و
`RESTRICT/NO ACTION` برای موجودیت‌های مرجع.** حذف گله، ثبت‌هایش را می‌برد؛
حذف کاربری که ثبت دارد مسدود می‌شود.

نمونه‌ای از فایل تولیدشده:

```sql
CREATE TABLE daily_logs (
  id text NOT NULL,
  flock_id text NOT NULL,
  date date NOT NULL,
  mortality integer DEFAULT 0 NOT NULL,
  cull integer DEFAULT 0 NOT NULL,
  feed_kg numeric(12,2) DEFAULT 0 NOT NULL,
  water_liter numeric(12,2) DEFAULT 0 NOT NULL,
  avg_temp numeric(5,1) NULL,
  feed_type text NULL,
  notes text NULL,
  created_by text NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted_at timestamptz NULL,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX daily_logs_flock_date_uq ON public.daily_logs USING btree (flock_id, date);

ALTER TABLE daily_logs ADD CONSTRAINT daily_logs_cycle_id_fkey
  FOREIGN KEY (flock_id) REFERENCES flocks(id) ON DELETE CASCADE;
```

> اگر به فرم Prisma نیاز دارید، نگاشت معادل چنین است (فقط برای مقایسه؛
> منبع حقیقت `schema.sql` است):
>
> ```prisma
> model DailyLog {
>   id         String    @id @default(uuid())
>   flockId    String    @map("flock_id")
>   date       DateTime  @db.Date
>   mortality  Int       @default(0)
>   cull       Int       @default(0)
>   feedKg     Decimal   @map("feed_kg")      @db.Decimal(12, 2)
>   waterLiter Decimal   @map("water_liter")  @db.Decimal(12, 2)
>   avgTemp    Decimal?  @map("avg_temp")     @db.Decimal(5, 1)
>   deletedAt  DateTime? @map("deleted_at")
>   flock      Flock     @relation(fields: [flockId], references: [id], onDelete: Cascade)
>   @@unique([flockId, date])
>   @@map("daily_logs")
> }
> ```
>
> در این پروژه عمداً Prisma انتخاب نشده: SQL خام + Drizzle اجازه می‌دهد
> مهاجرت‌ها تراکنشی و قابل بازبینی بمانند و در PGlite (WASM) هم اجرا شوند.

---

## ۳. ساختار پوشه‌ها

```
platform/
├── packages/domain/                 منطق مشترک — بدون فریم‌ورک، بدون I/O
│   ├── src/
│   │   ├── types.ts                 مدل‌های دامنه (Flock, DailyLog, …) + برچسب نقش‌ها
│   │   ├── standards.ts             جدول استاندارد راس ۳۰۸ (وزن، دان تجمعی، FCR)
│   │   ├── breeds.ts                منحنی چهار نژاد + تشخیص نام فارسی/انگلیسی
│   │   ├── metrics.ts               قلب سیستم: FCR، تلفات، هزینه هر کیلو، هشدارها، سری روزانه
│   │   ├── uniformity.ts            یکنواختی گله از نمونه‌های وزن (CV و دامنه)
│   │   ├── jalali.ts                تقویم شمسی (تبدیل، تاریخ امروز به وقت مزرعه)
│   │   ├── format.ts                قالب‌بندی فارسی اعداد/تومان/درصد/وزن
│   │   ├── permissions.ts           ماتریس دسترسی نقش‌ها (منبع واحد API/وب/موبایل)
│   │   ├── offline.ts               صف آفلاین، تلاش دوباره، ادغام تعارض، خلاصه نوار وضعیت
│   │   ├── notifications.ts         برنامه‌ریزی اعلان (ساکت شبانه، واکسن، پرهیز دارو)
│   │   └── persian-intent.ts        تجزیه جمله فارسی دستیار (ثبت/هزینه/فروش/وزن/پرسش)
│   └── tests/                       ۹۹ تست (node:test + tsx)
│
├── apps/api/                        NestJS 11 + Drizzle + PostgreSQL/PGlite
│   ├── src/
│   │   ├── auth/                    ورود/تازه‌سازی/خروج، JwtAuthGuard، RolesGuard
│   │   ├── common/                  mappers، خطای اعتبارسنجی فارسی، دسترسی به گله، نقش‌ها
│   │   ├── db/                      اتصال، schema (Drizzle)، migrate، seed، migrations/*.sql
│   │   ├── farms/ halls/ flocks/    موجودیت‌های اصلی
│   │   ├── logs/                    ثبت روزانه (upsert + انبار)
│   │   ├── weight-samples/          وزن‌گیری نمونه‌ای + یکنواختی
│   │   ├── expenses/ sales/         مالی
│   │   ├── inventory/               دفتر انبار دان
│   │   ├── health/                  واکسن، دارو، دوره پرهیز
│   │   ├── analytics/               شاخص‌ها (و حذف فیلد مالی برای نقش محدود)
│   │   ├── reminders/               کارهای امروز و هشدارها
│   │   ├── reports/                 خروجی Excel و PDF (RTL)
│   │   ├── ai/                      کلاینت FastAPI + جایگزین محلی
│   │   ├── assistant/               دستیار فارسی متن/صدا
│   │   └── sync/                    push/pull آفلاین با رسید idempotent
│   └── test/app.e2e.spec.ts         ۱۰۵ تست یکپارچه روی PGlite
│
├── apps/web/                        داشبورد — React 18 + Vite 6 + Tailwind 3 + Recharts
│   ├── src/
│   │   ├── pages/                   LoginPage · TodayPage (کارگر) · DashboardPage
│   │   ├── components/              AppShell، KpiCard، charts، AlertList، BigNumberField
│   │   ├── lib/                     api، types، format، kpi، series، nav
│   │   └── test/                    آزمون رندر با jsdom
│   └── vite.config.ts               پروکسی /api → API، پیکربندی Vitest
│
├── apps/mobile/                     Expo (React Native) + SQLite
│   ├── App.tsx                      ناوبری، بوت از حافظه محلی، همگام‌سازی دوره‌ای
│   └── src/
│       ├── api/                     fetch + توکن (SecureStore) + تفکیک خطای شبکه
│       ├── storage/                 SQLite: صف، ثبت‌ها، گله‌ها، یادآورها
│       ├── sync/                    چسب صف ↔ API (منطق در بسته دامنه)
│       ├── notifications/           زمان‌بندی اعلان محلی
│       ├── screens/                 ورود، خانه، ثبت سریع، صف، تنظیمات
│       └── components/              کارت، دکمه بزرگ، صفحه‌کلید عددی فارسی
│
├── services/ai/                     FastAPI (پایتون) — اختیاری ولی مستقل
│   ├── app/main.py                  مسیرها + سلامت + احراز کلید اختیاری
│   ├── app/services.py              گومپرتز، بارگیری، ریسک بیماری، پیش‌بینی دان
│   ├── app/breeds.py                منحنی نژادها (هم‌ارز TS)
│   └── app/speech.py                تبدیل گفتار (faster-whisper/vosk، اختیاری)
│
├── scripts/
│   ├── import-legacy.mjs            انتقال داده از نسخه SQLite قدیمی
│   ├── dump-schema.mts              تولید docs/architecture/schema.sql
│   └── fetch-openapi.mjs            تولید docs/architecture/openapi.yaml
│
├── docs/
│   ├── architecture/                همین سند + schema.sql + openapi.yaml
│   ├── demo/                        صفحه نمایشی فارسی (فقط با SERVE_DEMO=1)
│   └── samples/                     نمونه خروجی Excel/PDF
│
├── docker-compose.yml               postgres + redis + api
└── package.json                     ورک‌اسپیس‌ها و اسکریپت‌های ریشه
```

**قاعده‌ی وابستگی:** `web` و `mobile` و `api` → `domain`. هیچ‌کدام به هم
وابسته نیستند. `api` → `services/ai` فقط از راه HTTP و **اختیاری**.

---

## ۴. کد سه ماژول کلیدی

### ۴.۱. ثبت روزانه (`apps/api/src/logs/logs.service.ts`)

مسئله: کارگر روزی یک‌بار ثبت می‌کند، ولی گاهی دوباره (اصلاح عدد) ثبت می‌کند؛
ممکن است دو گوشی هم‌زمان بفرستند. ثبت تکراری نباید رکورد دوم بسازد و نباید
موجودی انبار را دوبار کم کند.

```ts
async save(farmId: string, userId: string, flockId: string, dto: SaveLogDto, timezone = "Asia/Tehran") {
  const flock = await this.access.require(farmId, flockId);   // گله متعلق به همین مزرعه؟
  const today = todayIso(timezone);
  const errors: Record<string, string> = {};

  if (dto.date > today) errors.date = "ثبت تاریخ آینده مجاز نیست.";
  if (dto.date < flock.start_date) errors.date = "تاریخ پیش از جوجه‌ریزی گله است.";
  if (flock.closed_date && dto.date > flock.closed_date)
    errors.date = "گله بسته شده و ثبت تاریخ بعد از آن مجاز نیست.";

  const existing = await this.db.select().from(dailyLogs)
    .where(and(eq(dailyLogs.flockId, flockId), eq(dailyLogs.date, dto.date))).limit(1);

  const liveBefore = await this.liveBirdsAt(farmId, flockId, dto.date);
  const lostNow = dto.mortality + (dto.cull ?? 0);
  if (lostNow > liveBefore)
    errors.mortality = `تلفات و حذف از تعداد زنده (${liveBefore} قطعه) بیشتر است.`;
  assertValid(errors, "ثبت انجام نشد؛ مقادیر را بررسی کنید.");

  await this.db.transaction(async (tx: any) => {
    if (previous) {
      await tx.update(dailyLogs).set({ ...values, deletedAt: null, updatedAt: new Date() })
        .where(eq(dailyLogs.id, previous.id));
    } else {
      // clientId از گوشی = شناسه رکورد؛ ارسال دوباره صف همان رکورد را می‌نویسد
      const id = dto.clientId && /^[0-9a-zA-Z_-]{8,64}$/.test(dto.clientId) ? dto.clientId : randomUUID();
      await tx.insert(dailyLogs).values({ id, ...values })
        .onConflictDoUpdate({ target: [dailyLogs.flockId, dailyLogs.date], set: { ...values, updatedAt: new Date() } });
    }

    // انبار: برگرداندن مصرف قبلی، کسر مصرف جدید — ویرایش، موجودی را دوبار کم نمی‌کند
    if (previous && !previous.deletedAt) {
      await this.inventory.add(tx, farmId, previous.feedType ?? feedType, n(previous.feedKg));
    }
    await this.inventory.add(tx, farmId, feedType, -dto.feedKg);
  });

  const saved = await this.db.select().from(dailyLogs)
    .where(and(eq(dailyLogs.flockId, flockId), eq(dailyLogs.date, dto.date))).limit(1);
  return { ...toLog(saved[0]), updated: Boolean(previous) };
}
```

**چهار تضمین این تابع:** ① یک رکورد در هر روز (ایندکس یکتا + upsert)؛
② رد تاریخ آینده و تلفات بیشتر از موجودی، با پیام فارسیِ همان فیلد؛
③ انبار در همان تراکنش اصلاح می‌شود (اختلاف مقدار قبلی و جدید)؛
④ `clientId` گوشی به‌عنوان شناسه رکورد، پس ارسال دوباره بی‌خطر است.

---

### ۴.۲. محاسبه FCR (`packages/domain/src/metrics.ts`)

مسئله: FCR یعنی چند کیلو دان برای چند کیلو رشد. اگر «وزن زنده فعلی» تنها
مخرج باشد، هر فروش میان‌دوره‌ای FCR را مصنوعاً بدتر نشان می‌دهد.

```ts
const liveBiomassKg = (liveBirds * currentWeightG) / 1000;
const soldWeightKg = sales.reduce((s, x) => s + (x.total_weight_kg || 0), 0);
const producedKg = liveBiomassKg + soldWeightKg;      // وزن زنده تولیدشده

// قاعده ۱: FCR = مجموع دان مصرفی ÷ مجموع وزن زنده تولیدشده
const fcr = totalFeedKg > 0 && producedKg > 0.001 ? totalFeedKg / producedKg : null;

// استاندارد گله: ضریب تبدیل نژاد با احتساب تلفات (خوراک پرندگان تلف‌شده)
const stdFcr = standardAt(ageDays).fcr * (1 + mortalityPct / 100);
```

مقایسه با استاندارد هم‌سن انجام می‌شود، نه با استاندارد پایان دوره؛ و
`stdFcr` اثر تلفات را اضافه می‌کند (پرنده‌ای که تلف شده دان خورده و رشد
نداده). مثال واقعی از داده نمونه:

| ورودی | مقدار |
|---|---|
| دان مصرفی تجمعی | ۲۶٬۵۳۵ کیلوگرم |
| پرنده زنده × وزن فعلی | ۱۱٬۷۷۱ × ۱٬۴۲۶ گرم = ۱۶٬۷۸۵ کیلوگرم |
| فروش میان‌دوره‌ای | ۰ کیلوگرم |
| **FCR محاسبه‌شده** | ۲۶٬۵۳۵ ÷ ۱۶٬۷۸۵ = **۱٫۵۸** |
| استاندارد نژاد در روز ۲۹ | ۱٫۵۵ × (۱ + ۱٫۸۸٪) = **۱٫۵۸** |

عدد در داشبورد، در PDF و در موبایل از همین تابع می‌آید. تست‌های دامنه
حالت‌های مرزی (بدون وزن، بدون دان، فروش میان‌دوره) را پوشش می‌دهند.

---

### ۴.۳. سرویس پیش‌بینی وزن (`services/ai/app/services.py` + جایگزین در API)

مسئله: با ۰ تا ۵ وزن‌گیری باید وزن پایان دوره (و در ادامه تاریخ بهینه
بارگیری) برآورد شود؛ سرویس AI هم ممکن است خاموش باشد.

```python
def forecast_weight(points, target_age, target_weight, breed_name=None):
    """پیش‌بینی وزن پایان دوره. خروجی: (روش، وزن، رشد روزانه، منحنی، یادداشت‌ها، نژاد)"""
    breed, _matched, breed_note = resolve_breed(breed_name)
    notes = [breed_note]
    points = sorted(points)

    if len(points) >= 2:                      # ① برازش گومپرتز روی داده واقعی
        model = fit_gompertz(points, target_weight)
        if model is not None:
            projected = model.predict(target_age)
            if 0.5 * target_weight <= projected <= 1.8 * target_weight:   # ② پلوس ماشین‌سنجی
                ...
                return "gompertz-fit", round(projected), round(daily, 1), curve, notes, breed.name_fa
        notes.append("برازش گومپرتز خارج از بازه معقول بود؛ منحنی استاندارد نژاد استفاده شد.")

    if len(points) == 1:                      # ③ یک وزن‌گیری: رشد استاندارد نژاد
        day, weight = points[0]
        gain = max(10.0, (standard_weight(day + 7, breed) - standard_weight(day, breed)) / 7)
        projected = weight + gain * max(0, target_age - day)
        ...

    return "standard-curve", ...              # ④ هیچ وزن‌گیری: منحنی نژاد
```

سمت NestJS، سرویس AI فقط «بهتر» است نه «لازم»:

```ts
async forecast(farmId: string, flockId: string): Promise<ForecastResult> {
  const { metrics, weights, ageOf } = await this.flockData(farmId, flockId);
  const remote = await this.post("/predict/weight", { /* weights, target, breed */ });

  if (remote) return { source: "ai", fallback: false, ... };   // پاسخ سرویس پایتون
  return this.localForecast(metrics);                          // fallback: source=local
}
```

`localForecast` همان منحنی **همان نژاد گله** را برمی‌دارد (نه همیشه راس)،
آخرین وزن اندازه‌گیری‌شده را روی منحنی جایگزین می‌کند و ضریب اطمینان را از
تعداد وزن‌گیری‌ها می‌سازد (`weighCount >= 3 ? 0.6 : 0.35`). خروجی هر دو مسیر
یک شکل دارد (`method`, `confidence`, `notes`, `curve[]` با `source`)، پس
داشبورد لازم نیست بداند پاسخ از کدام مسیر آمده — فقط برچسب «منبع: AI/محلی»
را نشان می‌دهد.

---

## ۵. مشخصات API

- پیشوند همه مسیرها: **`/api/v1`**
- سند تعاملی: **`GET /api/docs`** (Swagger UI) · سند ماشین‌خوان: `GET /api/docs-json`
- فایل ذخیره‌شده: **[`openapi.yaml`](./openapi.yaml)** — ۵۴ مسیر، ۷۴ عملیات، ۲۹ schema
- احراز هویت: `Authorization: Bearer <accessToken>` (JWT با تازه‌سازی)
- خطای اعتبارسنجی: `422/400` با ساختار یکسان `{ message, errors: { field: "پیام فارسی" } }`
- زبان پیام‌ها: فارسی — همان چیزی که کاربر نهایی می‌بیند، مستقیم قابل نمایش است.

### مرور مسیرها

| گروه | تعداد | مسیرها |
|---|---|---|
| `auth` | ۸ | `POST /auth/register` · `/login` · `/refresh` · `/logout` · `/change-password` · `/switch-farm` · `GET|PATCH /auth/me` |
| `farm` | ۹ | `GET|POST|PATCH /farm` · `GET|PATCH /farm/settings` · `GET|POST /farm/members` · `PATCH|DELETE /farm/members/:userId` |
| `halls` | ۵ | `GET|POST /halls` · `GET|PATCH|DELETE /halls/:id` |
| `flocks` | ۸ | `GET|POST /flocks` · `GET|PATCH|DELETE /flocks/:id` · `/flocks/:id/stats` · `/close` · `/reopen` |
| `logs` | ۳ | `GET|POST /flocks/:flockId/logs` · `DELETE /logs/:id` |
| `weights` | ۳ | `GET|POST /flocks/:flockId/weights` · `DELETE /:id` |
| `health` | ۸ | `GET /flocks/:flockId/health` · `GET|POST /vaccinations` · `PATCH|DELETE /vaccinations/:id` · `GET|POST /medications` · `DELETE /medications/:id` |
| `expenses` | ۴ | `GET|POST /flocks/:flockId/expenses` · `PATCH|DELETE /:id` |
| `sales` | ۳ | `GET|POST /flocks/:flockId/sales` · `DELETE /:id` |
| `inventory` | ۳ | `GET /farm/inventory` · `POST /farm/inventory/set` · `/adjust` |
| `analytics` | ۲ | `GET /analytics/overview` · `GET /analytics/flocks/:id` |
| `reminders` | ۲ | `GET /reminders?horizonDays=` · `GET /reminders/badge` |
| `reports` | ۴ | `GET /reports/flocks/:id` · `/export?format=xlsx\|pdf\|json` · `GET /reports/farm` · `/export` |
| `ai` | ۵ | `GET /ai/status` · `/ai/flocks/:id/forecast` · `/loading-date` · `/risk` · `/ai/farm/feed` |
| `assistant` | ۴ | `GET /assistant/examples` · `POST /assistant/message` · `/confirm` · `/voice` |
| `sync` | ۲ | `POST /sync/push` · `GET /sync/pull?since=` |
| `health` | ۱ | `GET /health` (بدون احراز هویت، برای liveness probe) |

### ماتریس نقش → مسیر (خلاصه)

| مسیر | owner | manager | worker | vet |
|---|:--:|:--:|:--:|:--:|
| ثبت روزانه/وزن، دیدن گله‌ها | ✅ | ✅ | ✅ | ✅ |
| هزینه و فروش | ✅ | ✅ | ❌ | ❌ |
| ساخت/ویرایش گله، سالن، تنظیمات | ✅ | ✅ | ❌ | ❌ |
| حذف گله، مدیریت اعضا | ✅ | ❌ | ❌ | ❌ |
| `analytics/overview` | ✅ کامل | ✅ کامل | ✅ بدون فیلد مالی | ✅ بدون فیلد مالی |

### دو قرارداد مهم

**۱. همگام‌سازی آفلاین**

```http
POST /api/v1/sync/push
{ "operations": [ { "clientId": "m-abc123xy", "type": "log.save",
                    "flockId": "flock-1", "payload": { "date": "2026-10-24",
                    "mortality": 3, "feedKg": 900 } } ] }

200 → { "serverTime": "…", "applied": 1, "duplicates": 0, "failed": 0,
        "results": [ { "clientId": "m-abc123xy", "status": "applied", "entityId": "…" } ] }
```

`type` ∈ `log.save | weight.create | expense.create | sale.create`.
ارسال دوباره همان `clientId` → `"status": "duplicate"` (بدون رکورد دوم).
خطای یک عملیات، بقیه صف را متوقف نمی‌کند.

**۲. پیش‌بینی با تضعیف تدریجی**

```http
GET /api/v1/ai/flocks/:id/forecast
200 → { "source": "ai" | "local", "fallback": false | true,
        "method": "gompertz-fit" | "standard-curve", "confidence": 0.6,
        "projectedWeightGr": 2532, "curve": [ … ] }
```

`fallback: true` یعنی سرویس پایتون در دسترس نبود و همان محاسبه در TS انجام
شد. هرگز ۵۰۳ به کاربر نمی‌دهد.

---

## ۶. طرح صفحه (Wireframe متنی)

### الف) داشبورد وب — برای مالک/مدیر

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🐔 مرغ‌یار            مزرعه نمونه            [ امروز ] [ داشبورد ]      خروج │  ← سربرگ چسبان
├──────────────────────────────────────────────────────────────────────────────┤
│ امروز: جمعه ۱ آبان ۱۴۰۵ · شاخص‌ها و روند گله                                  │
│                                                                              │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐                  │
│ │ ضریب تبدیل │ │ تلفات و حذف│ │ میانگین وزن│ │ بهای هر کیلو│   ← ۴ KPI، رنگ مرزی │
│ │   ۱٫۵۸     │ │   ۱٫۹٪     │ │ ۱٫۴۳ کیلو │ │  ۷۹٬۴۰۷    │      سبز/زرد/قرمز   │
│ │ استاندارد ۱٫۵۵│ │ ۲۲۹ از ۱۲٬۰۰۰│ │ استاندارد ۱٫۶۲│ │ بازار ۹۸٬۰۰۰│              │
│ │ چرا: …     │ │ چرا: …     │ │ چرا: …     │ │ چرا: …     │   ← جمله‌ی راهنما     │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘                  │
│                                                                              │
│ [سود پیش‌بینی] [دان امروز] [موجودی دان] [تا بارگیری]   ← نوار آمار عملیاتی    │
│                                                                              │
│ ┌─ ⚠️ هشدار فوری: افت مصرف آب نسبت به سه روز گذشته ──────────────────────────┐ │
│ │ چه شد: ۱۷۰ لیتر در برابر میانگین ۳٬۱۷۴ لیتر (−۹۴٪)                       │ │
│ │ چه کار کنم؟ گرفتگی خط آب و دمای سالن را بررسی کنید.                       │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌─ مصرف دان روزانه ────────────────────────── [۸٫۹٪ بالاتر از استاندارد] ─┐   │
│ │  ▁▂▃▅▆▇█  ستون = واقعی · خط‌چین = استاندارد نژاد (محور از راست به چپ)  │   │
│ │  زیرنویس: آخرین روز ۸۵ کیلوگرم — ۵٪ کمتر از استاندارد                  │   │
│ └─────────────────────────────────────────────────────────────────────────┘   │
│ ┌─ روند وزن ──────────────┐  ┌─ تلفات ────────────────────┐                  │
│ │ خط آبی = گله           │  │ ستون قرمز = روز             │                  │
│ │ خط‌چین = استاندارد      │  │ خط نارنجی = تجمعی ٪          │                  │
│ └─────────────────────────┘  └─────────────────────────────┘                  │
│                                                                              │
│ ┌─ ترکیب هزینه ───────────┐  ┌─ پیش‌بینی پایان دوره ──────┐                  │
│ │ ████████ دان ۶۴٪        │  │ وزن · FCR · درآمد · هزینه │                  │
│ │ ███ جوجه ۲۴٪ …          │  │ سود پیش‌بینی‌شده (بزرگ)     │                  │
│ └─────────────────────────┘  └────────────────────────────┘                  │
│ ┌─ گله‌های بسته‌شده (جدول: سن پایان، FCR، تلفات، فروش، سود) ─────────────┐    │
└──────────────────────────────────────────────────────────────────────────────┘
                                          ◀── چیدمان راست‌به‌چپ: عنوان‌ها راست،
                                              نمودارها با محور زمانِ معکوس
```

**قواعد پشت این چیدمان**

| بخش | قاعده |
|---|---|
| کارت KPI | یک عدد بزرگ + واحد + مرجع مقایسه + یک جمله «چرا این رنگ» |
| رنگ | سبز = در محدوده هدف · زرد = نزدیک مرز · قرمز = خارج از محدوده (همیشه با متن، نه فقط رنگ) |
| هشدار | «چه شد» + **«چه کار کنم؟»**؛ توصیه پنهان نمی‌شود |
| نمودار | خط استاندارد خاکستری و کم‌رنگ، عملکرد واقعی پررنگ |
| دسترسی | نقش بدون `cost:read` این صفحه را نمی‌بیند (سرور هم داده مالی را نمی‌فرستد) |

### ب) فرم ثبت روزانه موبایل — برای کارگر سالن

```
┌─────────────────────────────┐
│  🐔 ثبت سریع      [گله پاییزه] │   ← انتخاب گله فقط اگر >۱ گله باشد
│  [ امروز ]  [ دیروز ]         │   ← دو گزینه، نه تاریخ‌گزین
│  قبلاً ثبت شده: تلفات ۲، دان ۸۵│   ← وضعیت روز
├─────────────────────────────┤
│ ┌──────────┐ ┌──────────┐   │
│ │ 🐔 تلفات  │ │ 🌾 دان    │   │   ← کاشی لمسی بزرگ (≥۱۱۰ نقطه)
│ │ −   ۳   + │ │ −  ۸۵  + │   │   ← دکمه ± با گام (۱ و ۱۰)
│ │  قطعه     │ │  کیلوگرم  │   │
│ └──────────┘ └──────────┘   │
│ ┌──────────┐ ┌──────────┐   │
│ │ 💧 آب     │ │ 🌡️ دما    │   │
│ │ − ۱۸۰  + │ │ − ۳۲٫۵ + │   │
│ │  لیتر     │ │  درجه     │   │
│ └──────────┘ └──────────┘   │
│  انتظار امروز حدود ۱٬۸۲۴ کیلو │   ← راهنمای مقدار معقول (بدون آموزش)
│                             │
│ ┌─────────────────────────┐ │
│ │        ثبت امروز         │ │   ← یک دکمه تمام‌عرض، ۶۰ نقطه
│ └─────────────────────────┘ │
│  در گوشی ذخیره می‌شود؛ ارسال │   ← اطمینان‌بخشی، نه هشدار
│  خودکار است.                │
├─────────────────────────────┤
│   🏠 خانه  ➕ ثبت  🔄 صف  ⚙️  │   ← کارگر: فقط خانه/ثبت (صف فقط اگر خطا)
│        (۳)                   │   ← عدد = تعداد در صف
└─────────────────────────────┘
```

**قواعد پشت این چیدمان**

| قاعده | دلیل |
|---|---|
| چهار عدد، بدون جدول و بدون تاریخ‌گزین | ثبت در سالن با یک دست و دستکش |
| دکمه ± به‌جای تایپ | خطای انگشت کم، آموزش صفر |
| ارقام فارسی و لاتین هر دو پذیرفته می‌شود | کاربر هرچه دید تایپ می‌کند |
| مقدار قبلی پیش‌پر می‌شود | ثبت دوباره، رکورد دوم نمی‌سازد |
| «ذخیره در گوشی» به‌جای «در حال ارسال» | کاربر می‌داند داده گم نمی‌شود |
| تنها یک دکمه اصلی | سلسله‌مراتب تصمیم روشن |

---

## ۷. نقشه راه فازبندی‌شده

هر فاز «معیار خروج» دارد؛ فازی که معیارش برآورده نشده، تمام‌شده حساب نمی‌شود.

### MVP (فاز ۰ تا ۲) — «سیستم کار می‌کند» ✅

| فاز | محتوا | معیار خروج |
|---|---|---|
| ۰. مبانی | بسته دامنه، مهاجرت‌ها، seed، CI | `npm test` سبز · داده نمونه قابل ساخت |
| ۱. ثبت و محاسبه | auth/RBAC، سالن، گله، ثبت روزانه، وزن، هزینه، فروش، انبار | ثبت روزانه، FCR، تلفات و هزینه هر کیلو با تست یکپارچه |
| ۲. تصمیم و خروجی | قواعد کسب‌وکار (آب/تلفات)، یادآورها، گزارش Excel و PDF، تقویم شمسی | هشدار از داده واقعی · PDF فارسی RTL بدون حرف شکسته |

### نسخه ۱ (فاز ۳ تا ۶) — «برای استفاده روزمره آماده است» ✅

| فاز | محتوا | معیار خروج |
|---|---|---|
| ۳. چند مزرعه و نقش | `farm_members`، تغییر مزرعه، حذف نرم، تفکیک داده دو مزرعه | تست نشت داده بین دو مزرعه · نقش محدود داده مالی نمی‌بیند |
| ۴. هوش مصنوعی | منحنی نژاد، پیش‌بینی وزن و بارگیری، هشدار زودهنگام، دستیار فارسی متن/صدا | همیشه پاسخ، حتی با AI خاموش (`fallback:true`) · دستیار بدون تأیید ثبت نمی‌کند |
| ۵. موبایل آفلاین | SQLite، صف، `sync/push|pull`، اعلان محلی، ثبت یک‌دستی | ارسال دوباره = `duplicate` · شکست ۵ باره → «گیرکرده» با تصمیم کاربر |
| ۶. داشبورد وب | فارسی/RTL با وزیرمتن، ۴ KPI، سه نمودار، صفحه کارگر | رندر واقعی در تست · کارگر فقط «امروز» |

### نسخه کامل (فاز ۷ و ۸) — «عملیات تولید و مقیاس» ⏳

| فاز | کارهای باقی‌مانده | معیار خروج |
|---|---|---|
| ۷. آمادگی تولید | Redis (کش شاخص‌ها + صف اعلان) · S3 برای پیوست و گزارش · `docker compose` کامل با Postgres واقعی · پشتیبان‌گیری زمان‌بندی‌شده · مانیتورینگ (لاگ ساخت‌یافته + متریک) · استقرار CI/CD · سخت‌سازی (محدودیت نرخ، سرآیندهای امنیتی، HTTPS) | بازگردانی از پشتیبان آزموده شود · بار ۵۰ کاربر هم‌زمان بدون افت · هشدار خطای ۵xx |
| ۸. نسخه کامل محصول | مدیریت اعضا و سالن در وب · دستیار فارسی در وب · اعلان سرورمحور (FCM/APNs به‌جای فقط محلی) · رابط حل تعارض همگام‌سازی · داشبورد مصرف دان انبار و قیمت تمام‌شده به تفکیک سالن · مقایسه گله‌ها · API عمومی با کلید · آزمون روی دستگاه واقعی (Android/iOS) | دو گله هم‌زمان مقایسه شوند · اعلان حتی با اپ بسته برسد · نسخه بیلدشده روی گوشی واقعی تأیید شود |

### ریسک‌های شناخته‌شده و پاسخ

| ریسک | اثر | پاسخ فعلی | کار باقی‌مانده |
|---|---|---|---|
| سرویس AI قطع/کند | توقف پیش‌بینی | fallback محلی در همان ثانیه + مهلت کوتاه | صف بازمحاسبه در پس‌زمینه |
| دو گوشی هم‌زمان | داده تکراری | `sync_receipts` + upsert یکتا | رابط حل تعارض دستی برای موارد نادر |
| اینترنت ضعیف سالن | از دست رفتن ثبت | نوشتن اول در SQLite، ارسال بعدی | نمایش صریح «گیرکرده» و راهنمای اقدام |
| واحد پول اشتباه (ریال/تومان) | خطای بزرگ مالی | همه مبالغ تومان با `numeric(14,0)` | آزمون مهاجرت داده قدیمی |
| اعتماد به عدد بدون مرجع | تصمیم اشتباه | هر KPI مرجع مقایسه نشان می‌دهد | آموزش درون‌برنامه‌ای |

### آنچه عمداً در MVP نیست

پیامک، اپ بومی (native)، پیش‌بینی با مدل یادگیری عمیق، چند‌زبانه، پرداخت
آنلاین، و بازار فروش. هر کدام می‌توانند فاز مستقل خودشان را داشته باشند بدون
این‌که معماری فعلی را بشکنند — چون همه‌شان روی همان API و بسته دامنه سوار
می‌شوند.
