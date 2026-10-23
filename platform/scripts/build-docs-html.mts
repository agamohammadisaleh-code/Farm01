/**
 * ساخت یک فایل HTML خودبسنده از سند معماری.
 *
 * چرا: سند در مخزن به چند فایل تقسیم شده (README + schema.sql + openapi.yaml)
 * و برای خواندن/فرستادن به دیگران، کاربر باید سه فایل را جابه‌جا کند. این
 * اسکریپت همه را در یک فایل می‌ریزد که:
 *   - به اینترنت نیاز ندارد (فونت وزیرمتن به‌صورت base64 درون فایل است)،
 *   - راست‌به‌چپ و آماده چاپ است (Ctrl+P → PDF)،
 *   - DDL و OpenAPI را هم به‌صورت بخش بازشدنی در خود دارد.
 *
 * اجرا: npm run docs:html
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

const root = process.cwd();
const docsDir = join(root, "docs/architecture");

const read = (name: string) => readFileSync(join(docsDir, name), "utf8");
const fontDir = join(root, "node_modules/vazirmatn/fonts/webfonts");
const font = (name: string) => readFileSync(join(fontDir, name)).toString("base64");

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const markdown = read("README.md");
const rawBody = marked.parse(markdown, { async: false }) as string;

/**
 * شناسه‌گذاری عنوان‌ها.
 *
 * نسخه فعلی marked دیگر خودش id نمی‌سازد و فهرست ابتدای سند به لنگر نیاز
 * دارد. قاعده، همان قاعده آشنای GitHub است: حذف نشانه‌نگاری، تبدیل فاصله به
 * خط تیره، و حفظ نیم‌فاصله تا با پیوندهای نوشته‌شده در متن جور دربیاید.
 */
const slugify = (text: string) =>
  text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\-\s\u200c]/gu, "")
    .replace(/\s+/g, "-");

const seen = new Map<string, number>();
const body = rawBody.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_all, level: string, inner: string) => {
  const base = slugify(inner) || "بخش";
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  const id = count === 0 ? base : `${base}-${count}`;
  return `<h${level} id="${id}">${inner}</h${level}>`;
});

// پیوندهای داخلی فهرست باید به شناسه‌های واقعی عنوان‌ها برسند
const ids = new Set([...body.matchAll(/<h[1-6][^>]*id="([^"]+)"/g)].map((m) => m[1]));
const brokenLinks = [...body.matchAll(/href="#([^"]+)"/g)]
  .map((m) => decodeURIComponent(m[1]!))
  .filter((id) => !ids.has(id));

/**
 * تصویرهای سند درون همان فایل جا می‌گیرند (base64) تا «یک فایل» واقعاً یک فایل
 * بماند و به پوشه کنارش وابسته نباشد.
 */
const embedded = body.replace(/<img([^>]*?)src="(\.?\/?[^":]+)"([^>]*)>/g, (all, pre: string, src: string, post: string) => {
  try {
    const file = join(docsDir, src.replace(/^\.\//, ""));
    const mime = file.endsWith(".png") ? "image/png" : file.endsWith(".jpg") ? "image/jpeg" : null;
    if (!mime) return all;
    return `<img${pre}src="data:${mime};base64,${readFileSync(file).toString("base64")}"${post}>`;
  } catch {
    return all;
  }
});

const schema = read("schema.sql");
const openapi = read("openapi.yaml");
const generatedAt = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>معماری مرغ‌یار — سند کامل</title>
<style>
  @font-face {
    font-family: "Vazirmatn";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url(data:font/woff2;base64,${font("Vazirmatn-Regular.woff2")}) format("woff2");
  }
  @font-face {
    font-family: "Vazirmatn";
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url(data:font/woff2;base64,${font("Vazirmatn-Bold.woff2")}) format("woff2");
  }

  :root {
    --ink: #1b2430;
    --muted: #5b6b7c;
    --line: #d9e0e7;
    --brand: #1f7a4d;
    --brand-soft: #eef7f1;
    --code-bg: #f6f8fa;
    --warn-soft: #fff7e8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 2.5rem 2rem 5rem;
    max-width: 62rem;
    font-family: "Vazirmatn", system-ui, "Segoe UI", sans-serif;
    font-size: 15.5px;
    line-height: 1.95;
    color: var(--ink);
    background: #fff;
  }
  h1, h2, h3, h4 { line-height: 1.5; margin: 2.2rem 0 0.9rem; }
  h1 { font-size: 2rem; border-bottom: 3px solid var(--brand); padding-bottom: 0.6rem; }
  h2 {
    font-size: 1.45rem;
    color: var(--brand);
    border-bottom: 1px solid var(--line);
    padding-bottom: 0.4rem;
    margin-top: 3rem;
  }
  h3 { font-size: 1.15rem; margin-top: 2rem; }
  h4 { font-size: 1rem; color: var(--muted); }
  p { margin: 0.75rem 0; text-align: justify; }
  a { color: var(--brand); text-decoration: none; }
  a:hover { text-decoration: underline; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 2.5rem 0; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.1rem 0 1.6rem;
    font-size: 0.92rem;
    page-break-inside: avoid;
  }
  th, td { border: 1px solid var(--line); padding: 0.5rem 0.65rem; vertical-align: top; text-align: right; }
  th { background: var(--brand-soft); font-weight: 700; }
  tbody tr:nth-child(even) { background: #fbfcfd; }

  code, pre, kbd {
    font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
    direction: ltr;
    unicode-bidi: embed;
  }
  code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.86em; }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.9rem 1rem;
    overflow-x: auto;
    text-align: left;
    font-size: 0.82rem;
    line-height: 1.65;
    page-break-inside: avoid;
  }
  pre code { background: none; padding: 0; font-size: inherit; }

  blockquote {
    margin: 1.2rem 0;
    padding: 0.7rem 1rem;
    background: var(--warn-soft);
    border-right: 4px solid #e0a33a;
    border-radius: 6px;
    color: #4a3b1d;
  }
  blockquote p { margin: 0.35rem 0; }

  ul, ol { padding-right: 1.4rem; margin: 0.7rem 0; }
  li { margin: 0.35rem 0; }

  details {
    margin: 1.2rem 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.6rem 1rem;
    background: #fcfdfe;
  }
  summary { cursor: pointer; font-weight: 700; color: var(--brand); }
  details pre { max-height: 32rem; overflow: auto; margin-top: 0.8rem; }

  img {
    max-width: 100%;
    height: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    margin: 0.6rem 0;
    page-break-inside: avoid;
  }

  .cover {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 1.4rem 1.6rem;
    margin-bottom: 2rem;
    background: linear-gradient(180deg, var(--brand-soft), #fff);
  }
  .cover .meta { color: var(--muted); font-size: 0.9rem; }
  .cover h1 { border: 0; margin: 0 0 0.3rem; font-size: 1.8rem; }

  @media print {
    body { padding: 0; max-width: none; font-size: 11.5pt; line-height: 1.75; }
    h2 { page-break-after: avoid; }
    a { color: inherit; }
    img {
    max-width: 100%;
    height: auto;
    border: 1px solid var(--line);
    border-radius: 6px;
    margin: 0.6rem 0;
    page-break-inside: avoid;
  }

  .cover { page-break-after: always; }
    details { page-break-inside: avoid; }
    details[open] pre { max-height: none; }
  }
</style>
</head>
<body>
<header class="cover">
  <h1>معماری مرغ‌یار</h1>
  <div class="meta">
    سند یکجا: معماری، طرح داده، API، طرح صفحه، نقشه راه و محدودیت‌ها — با DDL و OpenAPI در انتها.<br />
    تولیدشده از مخزن در ${generatedAt} · همه‌چیز در همین یک فایل است (بدون نیاز به اینترنت).
  </div>
</header>

${embedded}

<hr />

<h2 id="پیوست-الف">پیوست الف — DDL پایگاه‌داده</h2>
<p>همان <code>schema.sql</code> که با <code>npm run docs:schema</code> از پایگاه‌داده پس از مهاجرت‌ها تولید می‌شود.</p>
<details>
<summary>نمایش DDL (${schema.split("\n").length} خط)</summary>
<pre><code>${escapeHtml(schema)}</code></pre>
</details>

<h2 id="پیوست-ب">پیوست ب — مشخصات OpenAPI</h2>
<p>همان <code>openapi.yaml</code> که از <code>/api/docs-json</code> سرور در حال اجرا گرفته می‌شود.</p>
<details>
<summary>نمایش OpenAPI (${openapi.split("\n").length} خط)</summary>
<pre><code>${escapeHtml(openapi)}</code></pre>
</details>

</body>
</html>
`;

const out = join(docsDir, "farm-architecture.html");
writeFileSync(out, html);
const size = statSync(out).size;

if (brokenLinks.length > 0) {
  console.warn(`⚠ ${brokenLinks.length} پیوند داخلی به عنوان ناموجود اشاره می‌کند: ${brokenLinks.join(", ")}`);
}
console.log(
  `✓ farm-architecture.html نوشته شد — ${(size / 1024).toFixed(0)} کیلوبایت، ` +
    `${markdown.split("\n").length} خط متن + DDL + OpenAPI`,
);
