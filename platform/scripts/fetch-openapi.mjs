/**
 * دریافت مشخصات OpenAPI از سرور در حال اجرا و ذخیره به‌صورت YAML.
 * اجرا: npm run docs:openapi   (سرور باید بالا باشد: npm run dev:api)
 * چرا از سرور؟ چون سند باید همان چیزی باشد که واقعاً سرو می‌شود، نه نسخه دست‌نویس.
 */
import { writeFileSync } from "node:fs";
import * as yamlModule from "js-yaml";

// js-yaml هم در نسخه‌های قدیمی (تابع dump) و هم جدید (default) استفاده می‌شود
const yaml = yamlModule.default ?? yamlModule;

const base = process.env.API_URL ?? "http://127.0.0.1:4000";
const res = await fetch(`${base}/api/docs-json`);
if (!res.ok) {
  console.error(`دریافت مشخصات ناموفق بود (${res.status}). آیا API بالا است؟`);
  process.exit(1);
}
const spec = await res.json();
const header =
  "# مرغ‌یار — مشخصات OpenAPI (تولیدشده از سرور در حال اجرا)\n" +
  `# منبع: ${base}/api/docs-json · سند تعاملی: ${base}/api/docs\n`;
writeFileSync("docs/architecture/openapi.yaml", header + yaml.dump(spec, { lineWidth: 120, sortKeys: false }));
console.log(`openapi.yaml نوشته شد — ${Object.keys(spec.paths).length} مسیر، ${Object.keys(spec.components.schemas).length} schema`);
