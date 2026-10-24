/**
 * ساخت PDF فارسی (راست‌به‌چپ) از راهنمای اجرا.
 *
 * چرا این اسکریپت؟ محیط ساخت مرورگر ندارد (بدون headless Chrome نمی‌توان از
 * HTML فایل PDF ساخت)، و کتابخانه‌های HTML→PDF هم فونت فارسی را درست نمی‌چینند.
 * پس همان روشی که خودِ گزارش‌های API استفاده می‌کنند به کار رفته است:
 * pdfkit + فونت وزیرمتن جاسازی‌شده، و چیدن واژه‌ها از راست به چپ
 * (`apps/api/src/reports/rtl-text.ts`).
 *
 * اجرا: npm run docs:pdf
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";
import bidiFactory from "bidi-js";

const bidi = bidiFactory();
import { latinDigits } from "../apps/api/src/reports/rtl-text";

const localRequire = createRequire(import.meta.url);
const fontDir = join(dirname(localRequire.resolve("vazirmatn/package.json")), "fonts", "ttf");
const FONT_REGULAR = join(fontDir, "Vazirmatn-Regular.ttf");
const FONT_BOLD = join(fontDir, "Vazirmatn-Bold.ttf");

const INK = "#1c2a24";
const MUTED = "#5f7168";
const LINE = "#d7e2db";
const BRAND = "#1e7a54";
const BRAND_SOFT = "#eef7f1";
const CODE_BG = "#f4f7f5";
const WARN_SOFT = "#fdf6e7";
const WARN_BAR = "#c98a12";

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = { top: 62, bottom: 58, left: 48, right: 48 };
const CONTENT_RIGHT = PAGE.width - MARGIN.right;
const CONTENT_LEFT = MARGIN.left;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const CONTENT_BOTTOM = PAGE.height - MARGIN.bottom;

/* ------------------------------- متن و واژه ------------------------------- */

interface Run {
  text: string;
  bold?: boolean;
  code?: boolean;
}
interface Word extends Run {
  w: number;
}

/** جفت‌های آینه‌ای یونیکد (قاعده L4) */
const MIRRORABLE: Record<string, string> = {
  "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{",
  "<": ">", ">": "<", "«": "»", "»": "«",
};
const DETACHABLE = /([0-9۰-۹.,٬٫]+)\s*(٪|%)/g;

/**
 * آماده‌سازی متن برای چیدن راست‌به‌چپ.
 * ارقام فارسی → لاتین: fontkit هر قطعه عددی فارسی را معکوس می‌چیند
 * («۹۲٫۹۷» به «۷۹٫۲۹»)، و ارقام لاتین درست روی خط می‌نشینند.
 */
function prepare(text: string): string {
  return latinDigits(text)
    // فقط نشانه‌های Markdown حذف می‌شوند؛ زیرخط را نگه می‌داریم چون بخشی از
    // شناسه‌های واقعی است (AI_URL، PG_DRIVER، PGLITE_DATA_DIR).
    .replace(/\*\*/g, "")
    .replace(DETACHABLE, "$1 $2")
    .replace(/[()[\]]/g, " $& ")
    .replace(/[·|—–→]/g, " $& ");
}

/**
 * شکستن متن به «واحدهای» قابل چیدن.
 *
 * قاعده مهم: واژه‌های لاتینِ پشت‌سرهم یک واحد می‌شوند.
 * چرا؟ چون خط از راست به چپ چیده می‌شود و اگر «npm ci» دو واحد جدا باشد،
 * «ci npm» دیده می‌شود. با ادغام، هر عبارت لاتین یک بلوک اتمیک است که
 * ترتیب درونی‌اش حفظ می‌شود.
 */
const PERSIAN_IN_WORD = /[\u0600-\u06FF\u200c]/;

function words(text: string): { text: string }[] {
  const tokens = prepare(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t);

  const units: string[] = [];
  for (const token of tokens) {
    const latin = !PERSIAN_IN_WORD.test(token);
    const previous = units[units.length - 1];
    const previousLatin = previous !== undefined && !PERSIAN_IN_WORD.test(previous);
    if (latin && previousLatin) {
      units[units.length - 1] = `${previous} ${token}`;
      continue;
    }
    units.push(token);
  }
  return units.map((text) => ({ text }));
}

/** تحلیل نشانه‌گذاری درون‌خطی: **پرتو** و `کد` */
function inlineRuns(text: string): Run[] {
  const out: Run[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx) });
    const raw = match[0];
    if (raw.startsWith("**")) out.push({ text: raw.slice(2, -2), bold: true });
    else out.push({ text: raw.slice(1, -1), code: true });
    last = idx + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.filter((r) => r.text.trim().length > 0);
}

/* ------------------------------ ابزار رسم متن ------------------------------ */

type Doc = PDFKit.PDFDocument;

const fontOf = (w: Run) => (w.code ? "mono" : w.bold ? "vazir-bold" : "vazir");

function spaceWidth(doc: Doc, size: number): number {
  doc.font("vazir").fontSize(size);
  return doc.widthOfString(" ");
}

function measureWord(doc: Doc, word: Run, size: number): number {
  doc.font(fontOf(word)).fontSize(size);
  return doc.widthOfString(word.text);
}

/** واژه‌های یک یا چند run را با اندازه واقعی برمی‌گرداند */
function toWords(doc: Doc, runs: Run[], size: number, monoLatin = true): Word[] {
  const out: Word[] = [];
  for (const run of runs) {
    for (const unit of words(run.text)) {
      // واحدی که هیچ نویسه فارسی ندارد با فونت مونو چاپ می‌شود (اسم فایل،
      // فرمان، شناسه). در تیترها مونو خاموش است تا «Docker Compose» با همان
      // فونت متن بنشیند و کشیده به نظر نرسد.
      const code = run.code === true || (monoLatin && !PERSIAN_IN_WORD.test(unit.text));
      const word: Word = { text: unit.text, code, bold: run.bold, w: 0 };
      word.w = measureWord(doc, word, size);
      out.push(word);
    }
  }
  return out;
}

/** شکستن واژه‌ها به خطوط، بر پایه عرض کادر */
function wrapWords(doc: Doc, list: Word[], maxWidth: number, size: number): Word[][] {
  const space = spaceWidth(doc, size);
  const lines: Word[][] = [];
  let current: Word[] = [];
  let width = 0;
  const pieces: Word[] = [];
  for (const word of list) {
    if (word.w <= maxWidth) {
      pieces.push(word);
      continue;
    }
    // قطعه بلندتر از کادر (مثل یک دستور کامل): به تکه‌های جا شدنی شکسته می‌شود
    for (const part of word.text.split(" ")) {
      let chunk = "";
      for (const ch of part) {
        const candidate = chunk + ch;
        const probe: Word = { text: candidate, code: word.code, bold: word.bold, w: 0 };
        if (chunk && measureWord(doc, probe, size) > maxWidth) {
          const fitting: Word = { text: chunk, code: word.code, bold: word.bold, w: 0 };
          fitting.w = measureWord(doc, fitting, size);
          pieces.push(fitting);
          chunk = ch;
        } else {
          chunk = candidate;
        }
      }
      if (chunk) {
        const tail: Word = { text: chunk, code: word.code, bold: word.bold, w: 0 };
        tail.w = measureWord(doc, tail, size);
        pieces.push(tail);
      }
    }
  }
  for (const word of pieces) {
    const add = (current.length ? space : 0) + word.w;
    if (current.length > 0 && width + add > maxWidth) {
      lines.push(current);
      current = [word];
      width = word.w;
    } else {
      current.push(word);
      width += add;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

/**
 * رسم یک خط از واژه‌ها.
 *
 * چیدن بر پایه «ترتیب منطقی» است، از راست به چپ: نخستین واحد متن، راست‌ترین
 * جای کادر را می‌گیرد. چون واحدهای لاتین پشت‌سرهم از قبل ادغام شده‌اند، هر
 * عبارت لاتین یک بلوک دست‌نخورده است و ترتیب درونی‌اش حفظ می‌شود.
 */
/**
 * رسم یک خط، با چیدمان دوجهته‌ی واقعی.
 *
 * چرا این‌قدر دقیق؟ چون یک سند فارسی پر از خط‌های آمیخته است: «پیش‌فرض 4000»،
 * «`npm ci` به‌جای نصب»، «(با `healthcheck`)». چیدن ساده «همه از راست به چپ»
 * در این خط‌ها ترتیب عبارت‌های لاتین و پرانتزها را می‌شکند.
 *
 * راه‌حل استاندارد: سطح دوجهته هر نویسه از الگوریتم یونیکد (bidi-js) گرفته
 * می‌شود؛ نویسه‌های هم‌سطح و هم‌فونت به «قطعه» تبدیل و سپس با قاعده L2
 * بازآرایی می‌شوند. نتیجه، همان چیزی است که یک مرورگر نشان می‌دهد.
 */
interface Segment {
  text: string;
  code: boolean;
  bold: boolean;
  level: number;
  w: number;
}

/** هر نویسه‌ای که در حروف فارسی نیست با فونت مونو خوانده می‌شود */
const PERSIAN_ANY = /[\u0600-\u06FF\u200c]/;

/**
 * شکستن یک خط به «اتم»های قابل چیدن.
 *
 * چرا اتم و نه نویسه؟ چون چیدن نویسه‌به‌نویسه ترتیب درونی چیزهای لاتین را
 * می‌شکند: تاریخ 2026-10-24 به 24-10-2026 تبدیل می‌شود و مسیر
 * `0001_init.sql` تکه‌تکه می‌شود. اینجا هر واژه لاتین یک اتم دست‌نیافتنی است
 * و فقط جای اتم‌ها با الگوریتم دوجهته تعیین می‌شود.
 */
function toSegments(
  doc: Doc,
  text: string,
  mask: boolean[],
  size: number,
  base: "rtl" | "ltr",
  boldMask: boolean[] = [],
): Segment[] {
  const { levels } = bidi.getEmbeddingLevels(text, base);
  const hasPersian = PERSIAN_ANY.test(text);

  const makeAtom = (raw: string, start: number): Segment => {
    const level = levels[start] ?? 0;
    const persian = PERSIAN_ANY.test(raw);
    const asciiOnly = /^[\x20-\x7E]*$/.test(raw);
    const code = !persian && asciiOnly && (mask[start] === true || !hasPersian);
    const bold = boldMask[start] === true;
    // قاعده L4: نویسه‌های آینه‌ای در سطح فرد آینه می‌شوند
    const shaped =
      level % 2 === 1
        ? raw.replace(/[()\[\]{}<>«»]/g, (ch) => MIRRORABLE[ch] ?? ch)
        : raw;
    return { text: shaped, code, bold, level, w: 0 };
  };

  /**
   * ساخت اتم‌ها از توکن‌های متن.
   *
   * دو ادغام لازم است و هر دو برای درست دیده‌شدن خط انجام می‌شود:
   *  ۱. واژه‌های لاتینِ پشت‌سرهم (مثل «Docker Compose» یا یک دستور کامل)
   *     یک اتم می‌شوند، وگرنه ترتیبشان در خط راست‌به‌چپ برعکس می‌شود.
   *  ۲. فاصله هرگز به اتم مجاور نمی‌چسبد، وگرنه pdfkit فاصله‌ی انتهای رشته
   *     را می‌بُرد و واژه‌ها به هم می‌چسبند.
   */
  const atoms: Segment[] = [];
  for (const token of text.matchAll(/\s+|\S+/g)) {
    const raw = token[0];
    const start = token.index ?? 0;
    const atom = makeAtom(raw, start);
    const isSpace = /^\s+$/.test(raw);
    const previous = atoms[atoms.length - 1];
    const beforePrevious = atoms[atoms.length - 2];
    const mergeable =
      !isSpace &&
      previous !== undefined &&
      beforePrevious !== undefined &&
      /^\s+$/.test(previous.text) &&
      beforePrevious.level % 2 === 0 &&
      atom.level % 2 === 0 &&
      beforePrevious.code === atom.code;
    if (mergeable) {
      beforePrevious.text = `${beforePrevious.text} ${atom.text}`;
      atoms.pop();
      continue;
    }
    atoms.push(atom);
  }

  for (const segment of atoms) {
    segment.w = /^\s+$/.test(segment.text)
      ? spaceWidth(doc, size) * segment.text.length
      : measureWord(doc, { text: segment.text, code: segment.code, bold: segment.bold }, size);
  }
  return atoms;
}

/** قاعده L2 یونیکد: معکوس‌کردن رشته‌های پیوسته از بالاترین سطح تا کمترین سطح فرد */
function reorder(segments: Segment[]): Segment[] {
  const order = segments.map((_, i) => i);
  const levels = segments.map((s) => s.level);
  const odd = levels.filter((l) => l % 2 === 1);
  if (!odd.length) return segments;
  const maxLevel = Math.max(...levels);
  const lowestOdd = Math.min(...odd);
  for (let level = maxLevel; level >= lowestOdd; level -= 1) {
    let i = 0;
    while (i < order.length) {
      if ((levels[order[i]!] ?? 0) < level) {
        i += 1;
        continue;
      }
      let j = i;
      while (j < order.length && (levels[order[j]!] ?? 0) >= level) j += 1;
      const slice = order.slice(i, j).reverse();
      order.splice(i, slice.length, ...slice);
      i = j;
    }
  }
  return order.map((i) => segments[i]!);
}

/**
 * رسم یک خط از متن، با چیدمان دوجهته‌ی واقعی.
 *
 * یک سند فارسی پر از خط‌های آمیخته است («پیش‌فرض 4000»، «`npm ci` به‌جای
 * نصب»، «(با `healthcheck`)»). چیدن ساده «همه از راست به چپ» ترتیب عبارت‌های
 * لاتین و پرانتزها را می‌شکند. اینجا سطح دوجهته هر نویسه از الگوریتم یونیکد
 * می‌آید و نتیجه همان چیزی است که مرورگر نشان می‌دهد.
 *
 * @param anchor لبه‌ای که خط از آن آغاز می‌شود (راست برای فارسی، چپ برای کد).
 */
function drawWords(
  doc: Doc,
  words: Word[],
  anchor: number,
  y: number,
  size: number,
  color = INK,
  base: "rtl" | "ltr" = "rtl",
  /** لبه چپ ناحیه؛ برای خط‌های چپ‌به‌راست (کد) لازم است */
  leftEdge = CONTENT_LEFT,
): number {
  const text = words.map((w) => w.text).join(" ");
  if (!text.trim()) return 0;

  const direction = base;

  const mask: boolean[] = [];
  const boldMask: boolean[] = [];
  words.forEach((word, i) => {
    for (let c = 0; c < word.text.length; c += 1) {
      mask.push(word.code === true);
      boldMask.push(word.bold === true);
    }
    if (i < words.length - 1) {
      mask.push(false);
      boldMask.push(false);
    }
  });

  const segments = reorder(toSegments(doc, text, mask, size, direction, boldMask));
  const total = segments.reduce((sum, s) => sum + s.w, 0);
  let cursor = direction === "rtl" ? anchor - total : leftEdge;

  for (const segment of segments) {
    if (/^\s+$/.test(segment.text)) {
      cursor += segment.w;
      continue;
    }
    doc
      .font(segment.code ? "mono" : segment.bold ? "vazir-bold" : "vazir")
      .fontSize(size)
      .fillColor(segment.code ? "#2b453a" : color);
    doc.text(segment.text, cursor, y, { lineBreak: false });
    cursor += segment.w;
  }
  return total;
}

/* --------------------------------- چیدمان --------------------------------- */

interface Ctx {
  doc: Doc;
  y: number;
  page: number;
  headingPages: Map<string, number>;
  collectOnly?: boolean;
}

const lineHeight = (size: number) => size * 1.85;

function newPage(ctx: Ctx) {
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = MARGIN.top;
  drawRunningHeader(ctx);
}

function ensureSpace(ctx: Ctx, need: number) {
  if (ctx.y + need > CONTENT_BOTTOM) newPage(ctx);
}

function drawRunningHeader(ctx: Ctx) {
  if (ctx.page <= 2) return; // جلد و فهرست، سربرگ تکرارشونده لازم ندارند
  const { doc } = ctx;
  doc.font("vazir").fontSize(8).fillColor(MUTED);
  const title = words("راهنمای اجرا — پلتفرم مرغ‌یار");
  drawWords(doc, title.map((t) => ({ ...t, w: measureWord(doc, t, 8) })), CONTENT_RIGHT, MARGIN.top - 26, 8, MUTED);
  doc.moveTo(CONTENT_LEFT, MARGIN.top - 12).lineTo(CONTENT_RIGHT, MARGIN.top - 12).lineWidth(0.6).strokeColor(LINE).stroke();
}

/* -------------------------------- بلوک‌ها -------------------------------- */

function drawParagraph(ctx: Ctx, text: string, opts: { size?: number; color?: string; indent?: number; gap?: number } = {}) {
  const size = opts.size ?? 10;
  const indent = opts.indent ?? 0;
  const runs = inlineRuns(text);
  if (!runs.length) return;
  const list = toWords(ctx.doc, runs, size);
  const lines = wrapWords(ctx.doc, list, CONTENT_WIDTH - indent, size);
  for (const line of lines) {
    ensureSpace(ctx, lineHeight(size));
    drawWords(ctx.doc, line, CONTENT_RIGHT - indent, ctx.y, size, opts.color ?? INK);
    ctx.y += lineHeight(size);
  }
  ctx.y += opts.gap ?? 3;
}

function drawHeading(ctx: Ctx, level: 2 | 3, text: string) {
  const size = level === 2 ? 15 : 11.5;
  const spaceBefore = level === 2 ? 16 : 10;
  ensureSpace(ctx, spaceBefore + lineHeight(size) * 2.2);
  ctx.y += level === 2 ? 6 : 2;

  const list = toWords(ctx.doc, [{ text, bold: true }], size, false);
  const lines = wrapWords(ctx.doc, list, CONTENT_WIDTH, size);
  ctx.headingPages.set(text, ctx.page);

  for (const [i, line] of lines.entries()) {
    if (level === 2 && i === 0) {
      ctx.doc.rect(CONTENT_RIGHT - 3, ctx.y - 1, 3, lineHeight(size) - 4).fill(BRAND);
    }
    drawWords(ctx.doc, line, CONTENT_RIGHT - (level === 2 ? 10 : 0), ctx.y, size, level === 2 ? BRAND : INK);
    ctx.y += lineHeight(size);
  }
  if (level === 2) {
    ctx.doc.moveTo(CONTENT_LEFT, ctx.y - 4).lineTo(CONTENT_RIGHT, ctx.y - 4).lineWidth(0.8).strokeColor(BRAND_SOFT).stroke();
    ctx.y += 6;
  }
}

function drawBullet(ctx: Ctx, marker: string, text: string, indent = 0) {
  const size = 10;
  const markerWidth = 16;
  const list = toWords(ctx.doc, inlineRuns(text), size);
  const lines = wrapWords(ctx.doc, list, CONTENT_WIDTH - indent - markerWidth, size);
  ensureSpace(ctx, lineHeight(size));
  const startY = ctx.y;
  for (const line of lines) {
    ensureSpace(ctx, lineHeight(size));
    drawWords(ctx.doc, line, CONTENT_RIGHT - indent - markerWidth, ctx.y, size);
    ctx.y += lineHeight(size);
  }
  // نشانگر در سمت راست، هم‌تراز خط اول
  ctx.doc.font("vazir-bold").fontSize(size).fillColor(BRAND);
  ctx.doc.text(marker, CONTENT_RIGHT - indent - measureWord(ctx.doc, { text: marker }, size), startY, { lineBreak: false });
  ctx.y += 2;
}

function drawCheckboxLine(ctx: Ctx, text: string) {
  const size = 10;
  const boxSize = 8;
  const indent = 18;
  const list = toWords(ctx.doc, inlineRuns(text), size);
  const lines = wrapWords(ctx.doc, list, CONTENT_WIDTH - indent, size);
  const startY = ctx.y;
  ensureSpace(ctx, lineHeight(size));
  ctx.doc.rect(CONTENT_RIGHT - boxSize, startY + size * 0.35, boxSize, boxSize).lineWidth(0.8).strokeColor(MUTED).stroke();
  for (const line of lines) {
    ensureSpace(ctx, lineHeight(size));
    drawWords(ctx.doc, line, CONTENT_RIGHT - indent, ctx.y, size);
    ctx.y += lineHeight(size);
  }
  ctx.y += 2;
}

function drawQuote(ctx: Ctx, lines: string[]) {
  const size = 9.5;
  const inner: Word[][] = [];
  for (const text of lines) {
    inner.push(...wrapWords(ctx.doc, toWords(ctx.doc, inlineRuns(text), size), CONTENT_WIDTH - 22, size));
  }
  const height = inner.length * lineHeight(size) + 14;
  ensureSpace(ctx, height + 6);
  const top = ctx.y - 4;
  ctx.doc.rect(CONTENT_LEFT, top, CONTENT_WIDTH, height).fill(WARN_SOFT);
  ctx.doc.rect(CONTENT_RIGHT - 3, top, 3, height).fill(WARN_BAR);
  ctx.y = top + 8;
  for (const line of inner) {
    drawWords(ctx.doc, line, CONTENT_RIGHT - 14, ctx.y, size, "#4a3a18");
    ctx.y += lineHeight(size);
  }
  ctx.y += 8;
}

const PERSIAN_CHAR = /[\u0600-\u06FF\u200c]/;

/** متن را به قطعه‌های «فارسی» و «غیرفارسی» می‌شکند */
function splitPersian(text: string): { text: string; persian: boolean }[] {
  const parts: { text: string; persian: boolean }[] = [];
  let buffer = "";
  let mode: boolean | null = null;
  for (const ch of text) {
    // فاصله و نویسه‌های خنثی، جهت را عوض نمی‌کنند؛ به همان قطعه می‌چسبند
    if (/\s/.test(ch)) {
      buffer += ch;
      continue;
    }
    const persian = PERSIAN_CHAR.test(ch);
    if (mode === null) mode = persian;
    if (persian === mode) {
      buffer += ch;
      continue;
    }
    if (buffer.trim()) parts.push({ text: buffer, persian: mode });
    buffer = ch;
    mode = persian;
  }
  if (buffer.trim()) parts.push({ text: buffer, persian: mode === true });
  return parts;
}

/**
 * یک خط کد را می‌کشد.
 *
 * کد چپ‌به‌راست است، ولی توضیح‌های فارسی داخل آن (`# ...`) باید راست‌به‌چپ و با
 * فونت فارسی چیده شوند. پس خط به قطعه‌های «فارسی» و «غیرفارسی» شکسته می‌شود:
 * قطعه‌های غیرفارسی با فونت مونو و به ترتیب از چپ، و قطعه فارسی در کادر خودش
 * از راست به چپ (با همان تابع رسم واژه‌ها).
 */
/** شکستن ساده به واژه (برای خطوط کد؛ بدون آینه‌کردن پرانتز) */
function rawWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * رسم یک خط کد.
 *
 * قاعده‌ها:
 *  - خطی که با فارسی شروع می‌شود (خروجی یک فرمان) یک جمله فارسی است: کل خط
 *    راست‌به‌چپ و هم‌تراز لبه راست کادر چیده می‌شود، پس «خطوط: 130» درست
 *    می‌آید و ترتیب اعداد نمی‌شکند.
 *  - خطی که با لاتین شروع می‌شود، کد است: قطعه‌ها به ترتیب از چپ چیده
 *    می‌شوند؛ قطعه لاتین با فونت مونو و قطعه فارسی (توضیح) راست‌به‌چپ در
 *    عرض خودش. فونت مونو گلیف فارسی ندارد، پس فارسی هرگز با آن چاپ نمی‌شود.
 */
/** عرض واقعی یک خط کد/متن با فونت‌های مختلط */
function measureLine(doc: Doc, line: string, size: number): number {
  const wordsList: Word[] = line
    .split(/(\s+)/)
    .filter((part) => part.trim())
    .map((part) => ({ text: part, code: false, w: 0 }));
  let total = 0;
  let first = true;
  for (const word of wordsList) {
    total += (first ? 0 : spaceWidth(doc, size)) + measureSegments(doc, word.text, size);
    first = false;
  }
  return total;
}

/** عرض یک قطعه متن (کد یا فارسی) بدون چیدمان */
function measureSegments(doc: Doc, text: string, size: number): number {
  const segments = toSegments(doc, text, text.split("").map(() => false), size, PERSIAN_ANY.test(text) ? "rtl" : "ltr");
  return segments.reduce((sum, s) => sum + s.w, 0);
}

function drawCodeTextLine(doc: Doc, line: string, right: number, y: number, size: number, scrollLeft = CONTENT_LEFT) {
  if (!line.trim()) return;
  const wordsList: Word[] = line
    .split(/(\s+)/)
    .filter((part) => part.trim())
    .map((part) => ({ text: part, code: false, w: 0 }));
  for (const word of wordsList) word.w = measureWord(doc, word, size);
  // بلوک کد مثل ترمینال همیشه چپ‌چین و چپ‌به‌راست است. توضیح فارسی داخل خط
  // (مثل `# این کار را نکنید`) با الگوریتم دوجهته سر جای درستش می‌نشیند،
  // پس لازم نیست کل خط را برعکس کنیم.
  drawWords(doc, wordsList, right, y, size, "#243b31", "ltr", scrollLeft);
}

function drawCode(ctx: Ctx, code: string) {
  const size = 8.2;
  const padX = 8;
  const padY = 7;
  const maxWidth = CONTENT_WIDTH - padX * 2;

  // شکستن خطوط بلند؛ عرض با همان موتور اندازه‌گیری می‌شود که خط را می‌چیند
  // (وات‌های مونو برای کد و وزیرمتن برای توضیح فارسی)، وگرنه خط از کادر بیرون می‌زند.
  const visual: string[] = [];
  for (const raw of code.split("\n")) {
    const tokens = raw.replace(/\t/g, "  ").split(/(?<=\s)/);
    let line = "";
    for (const token of tokens) {
      const candidate = line + token;
      if (measureLine(ctx.doc, candidate, size) > maxWidth) {
        if (line.trim()) visual.push(line.trimEnd());
        line = "";
        // توکنی که به‌تنهایی هم جا نمی‌شود (JSON یک‌خطی) با شکست نویسه‌ای
        // تکه می‌شود، وگرنه از لبه صفحه بیرون می‌زند.
        if (measureLine(ctx.doc, token, size) > maxWidth) {
          let chunk = "";
          for (const ch of token) {
            if (chunk && measureLine(ctx.doc, chunk + ch, size) > maxWidth) {
              visual.push(chunk.trimEnd());
              chunk = ch.startsWith(" ") ? "" : ch;
              continue;
            }
            chunk += ch;
          }
          line = chunk;
          continue;
        }
        line = token;
        continue;
      }
      line = candidate;
    }
    visual.push(line.trimEnd());
  }

  const step = size * 1.5;
  let i = 0;
  while (i < visual.length) {
    const available = Math.floor((CONTENT_BOTTOM - ctx.y - padY * 2) / step);
    if (available < 3) newPage(ctx);
    const chunkSize = Math.max(3, Math.floor((CONTENT_BOTTOM - ctx.y - padY * 2) / step));
    const chunk = visual.slice(i, i + chunkSize);
    const height = chunk.length * step + padY * 2;
    const top = ctx.y;
    ctx.doc.rect(CONTENT_LEFT, top, CONTENT_WIDTH, height).fill(CODE_BG);
    ctx.doc.rect(CONTENT_LEFT, top, 2.5, height).fill("#c9d7ce");
    let y = top + padY;
    for (const line of chunk) {
      // کد، چپ‌به‌راست؛ توضیح فارسی داخلش راست‌به‌چپ
      drawCodeTextLine(ctx.doc, line, CONTENT_RIGHT - padX, y, size, CONTENT_LEFT + padX);
      y += step;
    }
    ctx.y = top + height + 8;
    i += chunkSize;
    if (i < visual.length) newPage(ctx);
  }
}

interface TableRow {
  cells: string[];
}

function drawTable(ctx: Ctx, header: TableRow, rows: TableRow[]) {
  const size = 8.6;
  const padX = 5;
  const padY = 4.5;
  const columns = header.cells.length;

  // عرض ستون‌ها: بیشینه عرض محتوا، سپس نرمال‌سازی روی عرض کادر
  const desired = new Array(columns).fill(0);
  const all = [header, ...rows];
  for (const row of all) {
    row.cells.forEach((cell, idx) => {
      const w = toWords(ctx.doc, inlineRuns(cell), size).reduce((sum, word) => sum + word.w + 2.6, 0);
      desired[idx] = Math.max(desired[idx] ?? 0, Math.min(w, CONTENT_WIDTH * 0.42));
    });
  }
  const total = desired.reduce((a, b) => a + b, 0) || 1;
  const minCol = 44;
  let widths = desired.map((d) => Math.max(minCol, (d / total) * CONTENT_WIDTH));
  const sum = widths.reduce((a, b) => a + b, 0);
  widths = widths.map((w) => (w / sum) * CONTENT_WIDTH);

  /**
   * هر سلول اندازه فونت خودش را می‌گیرد: اگر توکنی (مثل RATE_LIMIT_GLOBAL_MAX)
   * از عرض ستون بزرگ‌تر باشد، تا جا شدن کوچک می‌شود؛ سرریز روی ستون بعدی
   * نمی‌رود.
   */
  const cellLayout = (cell: string, idx: number) => {
    const available = (widths[idx] ?? 40) - padX * 2;
    let cellSize = size;
    let list = toWords(ctx.doc, inlineRuns(cell), cellSize);
    let widest = Math.max(0, ...list.map((w) => w.w));
    while (widest > available && cellSize > 6.4) {
      cellSize = Number((cellSize - 0.4).toFixed(2));
      list = toWords(ctx.doc, inlineRuns(cell), cellSize);
      widest = Math.max(0, ...list.map((w) => w.w));
    }
    return { lines: wrapWords(ctx.doc, list, available, cellSize), size: cellSize };
  };

  const drawRow = (row: TableRow, isHeader: boolean) => {
    const cells = row.cells.map((cell, idx) => cellLayout(cell, idx));
    const height = Math.max(...cells.map((c) => Math.max(1, c.lines.length))) * lineHeight(size) + padY * 2;
    // اگر جدول به صفحه بعد می‌رود، سرستون تکرار می‌شود؛ وگرنه ردیف‌های ادامه
    // بی‌سرستون و گیج‌کننده می‌شوند.
    const pageBefore = ctx.page;
    ensureSpace(ctx, height + 4);
    if (ctx.page !== pageBefore && !isHeader) headerOnThisPage = false;
    if (!isHeader && !headerOnThisPage) {
      drawRow(header, true);
      headerOnThisPage = true;
    }
    const top = ctx.y;
    // ستون اول در راست‌ترین جای کادر (راست‌به‌چپ)
    let right = CONTENT_RIGHT;
    cells.forEach((cell, idx) => {
      const width = widths[idx] ?? 40;
      const left = right - width;
      ctx.doc.rect(left, top, width, height).lineWidth(0.6).strokeColor(LINE).stroke();
      if (isHeader) ctx.doc.rect(left, top, width, height).fill(BRAND_SOFT);
      let y = top + padY;
      for (const line of cell.lines.length ? cell.lines : [[]]) {
        if (line.length) drawWords(ctx.doc, line, right - padX, y, cell.size, isHeader ? "#12583c" : INK, "rtl");
        y += lineHeight(size);
      }
      right = left;
    });
    ctx.y = top + height;
  };

  let headerOnThisPage = false;
  drawRow(header, true);
  headerOnThisPage = true;
  for (const row of rows) drawRow(row, false);
  ctx.y += 10;
}

/* ------------------------------- تجزیه Markdown ------------------------------- */

type Block =
  | { kind: "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: { number: string; text: string }[] }
  | { kind: "checks"; items: string[] }
  | { kind: "code"; code: string }
  | { kind: "table"; header: TableRow; rows: TableRow[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" };

/** نمادهای تصویری → معادل متنی (فونت وزیرمتن این ایموجی‌ها را ندارد) */
function stripEmoji(text: string): string {
  return text
    .replace(/[✅✓]\s*/g, "")
    .replace(/[✗✘]\s*/g, "نه: ")
    .replace(/⚠️\s*/g, "توجه: ")
    .replace(/❌\s*/g, "نه: ")
    .replace(/[🐔🔒📊📱🧠]/g, "")
    .trim();
}

function parseMarkdown(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const isTableRow = (line: string) => line.trim().startsWith("|") && line.trim().endsWith("|");
  /**
   * ستون‌های یک ردیف جدول.
   *
   * نشانه `|` داخل بک‌تیک (مثل `lsof -ti:4000 | xargs kill`) جداکننده ستون
   * نیست؛ اگر ساده split می‌کردیم، آن دستور به دو ستون می‌شکست.
   */
  const cellsOf = (line: string) => {
    const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    const cells: string[] = [];
    let current = "";
    let inCode = false;
    for (const ch of body) {
      if (ch === "`") inCode = !inCode;
      if (ch === "|" && !inCode) {
        cells.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current);
    return cells.map((c) => stripEmoji(c.trim()));
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // کد
    if (trimmed.startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        body.push((lines[i] ?? "").replace(/^[\s]*[✓✅]/u, "").replace(/[✗]/gu, ""));
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "code", code: body.join("\n") });
      continue;
    }

    // عنوان‌ها
    const heading = /^(#{2,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ kind: heading[1] === "##" ? "h2" : "h3", text: stripEmoji(heading[2] ?? "") });
      i += 1;
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      i += 1;
      continue; // عنوان اصلی، روی جلد می‌آید
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    // نقل‌قول
    if (trimmed.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        quote.push(stripEmoji((lines[i] ?? "").trim().replace(/^>\s?/, "")));
        i += 1;
      }
      blocks.push({ kind: "quote", lines: quote.filter(Boolean) });
      continue;
    }

    // جدول
    if (isTableRow(trimmed) && isTableRow((lines[i + 1] ?? "").trim()) && /^\|[\s:|-]+\|$/.test((lines[i + 1] ?? "").trim())) {
      const header: TableRow = { cells: cellsOf(trimmed) };
      i += 2;
      const rows: TableRow[] = [];
      while (i < lines.length && isTableRow((lines[i] ?? "").trim())) {
        rows.push({ cells: cellsOf((lines[i] ?? "").trim()) });
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // چک‌لیست
    if (/^-\s*\[[ x]\]/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s*\[[ x]\]/.test((lines[i] ?? "").trim())) {
        items.push(stripEmoji((lines[i] ?? "").trim().replace(/^-\s*\[[ x]\]\s*/, "")));
        i += 1;
      }
      blocks.push({ kind: "checks", items });
      continue;
    }

    // فهرست نشانه‌دار
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push(stripEmoji((lines[i] ?? "").trim().replace(/^[-*]\s+/, "")));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // فهرست شماره‌دار — شماره‌ی نوشته‌شده در سند حفظ می‌شود تا شماره‌ها
    // در بلوک‌های جدا (بین کدها) از یک شروع نشوند.
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: { number: string; text: string }[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test((lines[i] ?? "").trim())) {
        const raw = (lines[i] ?? "").trim();
        const number = /^\d+/.exec(raw)?.[0] ?? "1";
        items.push({ number, text: stripEmoji(raw.replace(/^\d+[.)]\s+/, "")) });
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // پاراگراف (خطوط پیاپی به هم می‌چسبند)
    const paragraph: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = (lines[i] ?? "").trim();
      if (!next || next.startsWith("```") || next.startsWith("|") || next.startsWith(">") || /^#{1,3}\s/.test(next) || /^[-*]\s/.test(next) || /^\d+[.)]\s/.test(next) || /^---+$/.test(next)) break;
      paragraph.push(next);
      i += 1;
    }
    blocks.push({ kind: "p", text: stripEmoji(paragraph.join(" ")) });
  }

  return blocks;
}

/* ---------------------------------- ساخت ---------------------------------- */

interface Built {
  buffer: Buffer;
  headingPages: Map<string, number>;
  pageCount: number;
}

async function build(headings: Map<string, number> | null): Promise<Built> {
  const markdown = readFileSync(join(process.cwd(), "docs/RUNBOOK.md"), "utf8");
  const blocks = parseMarkdown(markdown);
  const sections = blocks.filter((b): b is { kind: "h2"; text: string } => b.kind === "h2");

  const doc = new PDFDocument({
    size: "A4",
    margins: MARGIN,
    bufferPages: true,
    info: {
      Title: "راهنمای اجرا — پلتفرم مرغ‌یار",
      Author: "پلتفرم مرغ‌یار",
      Subject: "از نصب تا استقرار: API، داشبورد وب، اپ موبایل و سرویس تحلیل",
      Keywords: "راهنمای اجرا, NestJS, PostgreSQL, React, Expo, FastAPI",
    },
  });
  doc.registerFont("vazir", FONT_REGULAR);
  doc.registerFont("vazir-bold", FONT_BOLD);
  doc.registerFont("mono", "Courier");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const ctx: Ctx = { doc, y: MARGIN.top, page: 1, headingPages: new Map() };

  /* جلد */
  doc.rect(0, 0, PAGE.width, 232).fill(BRAND);
  doc.font("vazir-bold").fontSize(9).fillColor("#bfe6d2");
  const kicker = toWords(doc, [{ text: "پلتفرم مرغ‌یار — مدیریت پرورش مرغ گوشتی", bold: false }], 9);
  drawWords(doc, kicker, CONTENT_RIGHT, 58, 9, "#bfe6d2");
  const title = toWords(doc, [{ text: "راهنمای اجرا", bold: true }], 30);
  drawWords(doc, title, CONTENT_RIGHT, 86, 30, "#ffffff");
  const subtitle = toWords(doc, [{ text: "قدم به قدم: از نصب تا استقرار", bold: true }], 13);
  drawWords(doc, subtitle, CONTENT_RIGHT, 132, 13, "#d8f2e5");
  const sub2 = wrapWords(doc, toWords(doc, [{ text: "API، داشبورد وب، اپ موبایل آفلاین‌فرست و سرویس تحلیل — با خروجی مورد انتظار هر قدم و عیب‌یابی" }], 9.5), CONTENT_WIDTH, 9.5);
  let coverY = 158;
  for (const line of sub2) {
    drawWords(doc, line, CONTENT_RIGHT, coverY, 9.5, "#cdeadd");
    coverY += 15;
  }

  ctx.y = 262;
  const meta: [string, string][] = [
    ["نسخه سند", "همگام با مخزن (شاخه arena/9419963c-farm01)"],
    ["پشته فنی", "NestJS · PostgreSQL · Redis · React · Expo · FastAPI"],
    ["پیش‌نیازها", "Node.js ۲۰+ · Python ۳٫۱۰+ · Docker (اختیاری)"],
    ["داده نمونه", "owner@farm.ir / Secret1234"],
  ];
  for (const [label, value] of meta) {
    ensureSpace(ctx, 20);
    const lw = toWords(doc, [{ text: `${label}:`, bold: true }], 9.5);
    const used = drawWords(doc, lw, CONTENT_RIGHT, ctx.y, 9.5, MUTED);
    drawWords(doc, toWords(doc, [{ text: value }], 9.5), CONTENT_RIGHT - used - 8, ctx.y, 9.5, INK);
    ctx.y += 19;
  }

  /* فهرست */
  newPage(ctx);
  doc.font("vazir-bold").fontSize(16).fillColor(INK);
  drawWords(doc, toWords(doc, [{ text: "فهرست", bold: true }], 16), CONTENT_RIGHT, ctx.y, 16);
  ctx.y += 34;

  for (const section of sections) {
    ensureSpace(ctx, 22);
    const pageNo = headings?.get(section.text);
    const label = toWords(doc, inlineRuns(section.text), 10);
    const used = drawWords(doc, label, CONTENT_RIGHT, ctx.y, 10);
    // نقطه‌چین تا شماره صفحه (سمت چپ)
    const pageText = String(pageNo ?? 0);
    doc.font("vazir").fontSize(9).fillColor(MUTED);
    const numberWidth = doc.widthOfString(pageText);
    const startX = CONTENT_LEFT + numberWidth + 6;
    const endX = CONTENT_RIGHT - used - 8;
    if (endX > startX) {
      doc.save();
      doc.dash(1, { space: 3 }).moveTo(startX, ctx.y + 10).lineTo(endX, ctx.y + 10).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.undash();
      doc.restore();
    }
    doc.font("vazir").fontSize(9).fillColor(MUTED).text(pageText, CONTENT_LEFT, ctx.y, { lineBreak: false });
    ctx.y += 21;
  }

  /* بدنه */
  newPage(ctx);
  for (const block of blocks) {
    switch (block.kind) {
      case "h2":
        drawHeading(ctx, 2, block.text);
        break;
      case "h3":
        drawHeading(ctx, 3, block.text);
        break;
      case "p":
        drawParagraph(ctx, block.text);
        break;
      case "ul":
        for (const item of block.items) drawBullet(ctx, "•", item);
        ctx.y += 4;
        break;
      case "ol":
        for (const item of block.items) drawBullet(ctx, `${latinDigits(item.number)}.`, item.text);
        ctx.y += 4;
        break;
      case "checks":
        for (const item of block.items) drawCheckboxLine(ctx, item);
        ctx.y += 4;
        break;
      case "code":
        drawCode(ctx, block.code);
        break;
      case "table":
        drawTable(ctx, block.header, block.rows);
        break;
      case "quote":
        drawQuote(ctx, block.lines);
        break;
      case "hr":
        ensureSpace(ctx, 14);
        doc.moveTo(CONTENT_LEFT, ctx.y + 4).lineTo(CONTENT_RIGHT, ctx.y + 4).lineWidth(0.7).strokeColor(LINE).stroke();
        ctx.y += 14;
        break;
    }
  }

  /* پانویس صفحه‌ها */
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    if (p === 0) continue;
    const footerY = PAGE.height - 34;
    doc.font("vazir").fontSize(8).fillColor(MUTED);
    const label = `${p + 1} / ${total}`;
    doc.text(label, CONTENT_LEFT, footerY, { lineBreak: false });
    drawWords(doc, toWords(doc, [{ text: "راهنمای اجرا — مرغ‌یار" }], 8), CONTENT_RIGHT, footerY, 8, MUTED);
  }

  doc.end();
  const buffer = await finished;
  return { buffer, headingPages: ctx.headingPages, pageCount: total };
}

const first = await build(null);
const final = await build(first.headingPages);
const out = join(process.cwd(), "docs/RUNBOOK.pdf");
writeFileSync(out, final.buffer);
console.log(
  `✓ RUNBOOK.pdf نوشته شد — ${final.pageCount} صفحه، ${(statSync(out).size / 1024).toFixed(0)} کیلوبایت`,
);
