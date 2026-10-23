/**
 * نگهبان قواعد امنیتی و معماری.
 *
 * این اسکریپت همان چیزهایی را می‌سنجد که در بخش «۱۰. محدودیت‌ها» ادعا شده‌اند؛
 * بدون آن، ادعا یک‌بار درست است و فردا با یک کنترلر تازه باطل می‌شود.
 *
 * اجرا: npm run check:security   (در CI هم اجرا می‌شود)
 *
 * قاعده‌ها:
 *  ۱. هر کنترلر باید `JwtAuthGuard` و `RolesGuard` داشته باشد، مگر در فهرست
 *     استثناهای آگاهانه (احراز هویت و سلامت).
 *  ۲. هر مسیر در کنترلرهای کسب‌وکار باید تصمیم نقش داشته باشد (`@Roles`،
 *     روی متد یا کلاس). یعنی «هیچ مسیری بدون تصمیم» — نه «همه آزاد».
 *  ۳. هش گذرواژه فقط از `common/password.ts`.
 *  ۴. SQL خام فقط در لایه مهاجرت (بدون ورودی کاربر).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const srcDir = join(root, "apps/api/src");

/** استثناهای آگاهانه با دلیل — افزودن مورد تازه نیازمند توضیح است */
const CONTROLLER_EXEMPTIONS: Record<string, string> = {
  "auth/auth.controller.ts": "مسیرهای عمومی ورود/ثبت‌نام و مسیرهای شخصی کاربر (بدون نقش)",
  "health.controller.ts": "بررسی سلامت سرویس، عمومی و بدون داده کسب‌وکار",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(srcDir).filter((f) => f.endsWith(".ts"));
const controllers = files.filter((f) => f.endsWith(".controller.ts"));
const problems: string[] = [];

const rel = (f: string) => relative(srcDir, f).split(sep).join("/");

for (const file of controllers) {
  const name = rel(file);
  const source = readFileSync(file, "utf8");
  if (CONTROLLER_EXEMPTIONS[name]) continue;

  const hasJwt = /UseGuards\([^)]*JwtAuthGuard/.test(source);
  const hasRoles = /UseGuards\([^)]*RolesGuard/.test(source);
  if (!hasJwt) problems.push(`${name}: بدون JwtAuthGuard — مسیر محافظت‌نشده`);
  if (!hasRoles) problems.push(`${name}: بدون RolesGuard — نقش‌ها بررسی نمی‌شوند`);

  const classLevelRoles = /@Roles\([^)]*\)\s*\n\s*@Controller/.test(source);
  // هر گروه دکوراتور که به یک متد می‌رسد
  const groups = source.match(/(?:^\s*@[^\n]*\n)+(?=\s*(?:public |async )?[a-zA-Z0-9_]+\()/gm) ?? [];
  for (const group of groups) {
    if (!/@(Get|Post|Patch|Delete|Put)\(/.test(group)) continue;
    if (classLevelRoles || /@Roles\(/.test(group)) continue;
    const route = group.match(/@(Get|Post|Patch|Delete|Put)\(([^)]*)\)/)?.[0] ?? group.trim();
    problems.push(`${name}: مسیر ${route} تصمیم نقش ندارد (@Roles)`);
  }
}

for (const file of files) {
  const name = rel(file);
  const source = readFileSync(file, "utf8");
  if (name !== "common/password.ts" && /from "bcryptjs"/.test(source)) {
    problems.push(`${name}: bcrypt خارج از common/password.ts — هزینه هش پراکنده می‌شود`);
  }
  if (name !== "db/migrate.ts" && name !== "db/database.ts" && /\.query\(/.test(source)) {
    problems.push(`${name}: SQL خام (.query) — از drizzle با پارامتر استفاده کنید`);
  }
}

const controllerCount = controllers.length;
const routeCount = controllers.reduce((sum, f) => {
  const source = readFileSync(f, "utf8");
  return sum + (source.match(/@(Get|Post|Patch|Delete|Put)\(/g)?.length ?? 0);
}, 0);

if (problems.length > 0) {
  console.error(`✗ ${problems.length} تخلف از قواعد معماری و امنیتی:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `✓ قواعد امنیتی برقرار است — ${controllerCount} کنترلر، ${routeCount} مسیر، ` +
    `${Object.keys(CONTROLLER_EXEMPTIONS).length} استثنای مستند.`,
);
