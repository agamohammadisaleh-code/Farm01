import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";
import bidiFactory from "bidi-js";
import { PersianShaper } from "arabic-persian-reshaper";
import { formatJalali, toman } from "@farm/domain";
import type { FlockReport } from "./reports.service";

/**
 * خروجی PDF فارسی.
 *
 * دو مشکل متن فارسی در PDF وجود دارد و هر دو اینجا حل شده‌اند:
 *  ۱) شکل حروف: PDF متن را گلیف‌به‌گلیف می‌کشد، پس باید حروف به شکل
 *     چسبیده (initial/medial/final) تبدیل شوند — با `PersianShaper`.
 *  ۲) ترتیب نمایش: الگوریتم دوجهته یونیکد لازم است تا اعداد و واژه‌های
 *     لاتین در جمله فارسی جابه‌جا نشوند — با `bidi-js`.
 * فونت وزیرمتن هم جاسازی می‌شود تا فایل روی هر دستگاهی یکسان دیده شود.
 */

const localRequire = createRequire(__filename);
const bidi = bidiFactory();

let fontDir = "";
try {
  fontDir = join(dirname(localRequire.resolve("vazirmatn/package.json")), "fonts", "ttf");
} catch {
  fontDir = join(process.cwd(), "node_modules", "vazirmatn", "fonts", "ttf");
}
const FONT_REGULAR = join(fontDir, "Vazirmatn-Regular.ttf");
const FONT_BOLD = join(fontDir, "Vazirmatn-Bold.ttf");

/** آماده‌سازی متن فارسی برای رسم: شکل‌دهی حروف + مرتب‌سازی دوجهته */
export function rtl(text: string): string {
  const shaped = PersianShaper.convertArabic(text);
  const embedding = bidi.getEmbeddingLevels(shaped, "rtl");
  return bidi.getReorderedString(shaped, embedding);
}

/** ارقام فارسی برای خوانایی گزارش چاپی */
export function faDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

const nf = new Intl.NumberFormat("en-US");

const GREEN = "#2f7d5b";
const INK = "#1d2b23";
const MUTED = "#6b7a72";
const LINE = "#d8e2dc";

export async function buildFlockPdf(report: FlockReport): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 34, info: { Title: report.meta.flockName, Author: "مرغ‌یار" } });
  doc.registerFont("vazir", FONT_REGULAR);
  doc.registerFont("vazir-bold", FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const pageWidth = doc.page.width;
  const left = 34;
  const right = pageWidth - 34;
  const usable = right - left;

  /* --------------------------------- سربرگ --------------------------------- */
  doc.rect(0, 0, pageWidth, 78).fill(GREEN);
  doc.font("vazir-bold").fontSize(19).fillColor("#ffffff");
  doc.text(rtl("گزارش دوره پرورش"), right, 18, { width: 400, align: "right" });
  doc.font("vazir").fontSize(10).fillColor("#d9f0e4");
  doc.text(rtl(`${report.meta.farmName} · ${report.meta.hallName} · ${report.meta.flockName}`), right, 46, { width: 600, align: "right" });

  doc.font("vazir").fontSize(9).fillColor("#e7f4ec");
  doc.text(
    rtl(`تاریخ گزارش: ${formatJalali(report.meta.generatedAt.slice(0, 10))}  |  شروع دوره: ${report.meta.startDateJalali}`),
    left,
    30,
    { width: 300, align: "left" },
  );
  doc.text(rtl(`سن گله: ${report.meta.ageDays} روز`), left, 46, { width: 300, align: "left" });

  /* --------------------------------- شاخص‌ها --------------------------------- */
  const m = report.summary;
  let y = 96;
  doc.fillColor(INK).font("vazir-bold").fontSize(13);
  doc.text(rtl("شاخص‌های کلیدی"), right, y, { width: usable, align: "right" });
  y += 22;

  const cards: { label: string; value: string; hint: string }[] = [
    { label: "قطعه زنده", value: faDigits(nf.format(m.liveBirds)), hint: `از ${faDigits(nf.format(m.flock.initial_count))} قطعه اولیه` },
    { label: "وزن فعلی", value: `${faDigits(nf.format(m.currentWeightG))} گرم`, hint: `استاندارد ${faDigits(nf.format(m.stdWeightG))} گرم` },
    { label: "ضریب تبدیل", value: m.fcr == null ? "—" : faDigits(m.fcr.toFixed(2)), hint: `استاندارد ${faDigits(m.stdFcr.toFixed(2))}` },
    { label: "تلفات", value: `${faDigits(m.mortalityPct.toFixed(1))}٪`, hint: `استاندارد ${faDigits(m.expectedMortalityPct.toFixed(1))}٪` },
    { label: "یکنواختی", value: m.uniformityPct == null ? "—" : `${faDigits(String(m.uniformityPct))}٪`, hint: m.avgUniformityPct ? `میانگین ${faDigits(String(m.avgUniformityPct))}٪` : "بدون نمونه" },
    { label: "هزینه هر کیلو", value: m.costPerKgLive ? faDigits(nf.format(Math.round(m.costPerKgLive))) : "—", hint: "ریال بر کیلوگرم زنده" },
  ];

  const gap = 8;
  const cardW = (usable - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, i) => {
    const x = right - cardW - i * (cardW + gap);
    doc.roundedRect(x, y, cardW, 58, 6).fillAndStroke("#f5f9f6", LINE);
    doc.fillColor(MUTED).font("vazir").fontSize(8.5);
    doc.text(rtl(card.label), x + 8, y + 7, { width: cardW - 16, align: "right" });
    doc.fillColor(INK).font("vazir-bold").fontSize(14);
    doc.text(rtl(card.value), x + 8, y + 21, { width: cardW - 16, align: "right" });
    doc.fillColor(MUTED).font("vazir").fontSize(7.5);
    doc.text(rtl(card.hint), x + 8, y + 42, { width: cardW - 16, align: "right" });
  });
  y += 76;

  /* -------------------------------- ترکیب هزینه -------------------------------- */
  doc.fillColor(INK).font("vazir-bold").fontSize(13);
  doc.text(rtl("ترکیب هزینه"), right, y, { width: usable, align: "right" });
  y += 18;
  const barW = usable - 150;
  for (const slice of m.costBreakdown.slice(0, 6)) {
    if (y > doc.page.height - 90) break;
    doc.fillColor(MUTED).font("vazir").fontSize(9);
    doc.text(rtl(slice.label), right, y, { width: 110, align: "right" });
    const w = Math.max(2, (slice.share / 100) * barW);
    doc.rect(right - 120 - barW, y + 1, barW, 9).fill("#eef2ef");
    doc.rect(right - 120 - w, y + 1, w, 9).fill(slice.color);
    doc.fillColor(INK).fontSize(8.5);
    doc.text(rtl(`${faDigits(slice.share.toFixed(1))}٪ · ${faDigits(toman(Math.round(slice.amount)))}`), left, y, {
      width: usable - barW - 130,
      align: "left",
    });
    y += 15;
  }
  y += 8;

  /* ------------------------------ جدول مالی و پیش‌بینی ------------------------------ */
  const financial: [string, string][] = [
    ["هزینه کل", `${faDigits(toman(Math.round(m.totalCost)))} ریال`],
    ["درآمد فروش", `${faDigits(toman(Math.round(m.revenue)))} ریال`],
    ["سود/زیان ثبت‌شده", `${faDigits(toman(Math.round(m.netProfit)))} ریال`],
    ["سود پیش‌بینی پایان دوره", `${faDigits(toman(Math.round(m.projection.projectedProfit)))} ریال`],
    ["وزن پیش‌بینی پایان دوره", `${faDigits(nf.format(m.projection.projectedWeightG))} گرم`],
    ["دان مصرف‌شده", `${faDigits(nf.format(Math.round(m.totalFeedKg)))} کیلوگرم`],
  ];
  doc.fillColor(INK).font("vazir-bold").fontSize(13);
  doc.text(rtl("خلاصه مالی"), right, y, { width: usable, align: "right" });
  y += 18;
  const colW = usable / 2;
  financial.forEach(([label, value], i) => {
    const col = i % 2;
    const rowIdx = Math.floor(i / 2);
    const x = right - col * colW;
    const yy = y + rowIdx * 20;
    if (rowIdx % 2 === 0) doc.rect(x - colW + 6, yy - 2, colW - 12, 18).fill("#f7faf8");
    doc.fillColor(MUTED).font("vazir").fontSize(9);
    doc.text(rtl(label), x - colW + 12, yy, { width: colW - 150, align: "right" });
    doc.fillColor(INK).font("vazir-bold").fontSize(9);
    doc.text(rtl(value), x - 12, yy, { width: 140, align: "left" });
  });
  y += Math.ceil(financial.length / 2) * 20 + 14;

  /* -------------------------------- ثبت روزانه -------------------------------- */
  drawTable(doc, {
    title: "ثبت روزانه (خلاصه ۱۰ روز آخر)",
    right,
    left,
    y,
    columns: [
      { label: "تاریخ", width: 78, align: "right" },
      { label: "تلفات", width: 52, align: "center" },
      { label: "حذف", width: 48, align: "center" },
      { label: "دان (کیلوگرم)", width: 92, align: "center" },
      { label: "آب (لیتر)", width: 82, align: "center" },
      { label: "دما", width: 54, align: "center" },
      { label: "وزن (گرم)", width: 80, align: "center" },
    ],
    rows: report.tables.logs.slice(-10).map((l) => {
      const w = report.tables.weights.find((x) => x.date === l.date);
      return [
        formatJalali(l.date),
        faDigits(nf.format(l.mortality)),
        faDigits(nf.format(l.cull)),
        faDigits(nf.format(Math.round(l.feed_kg))),
        faDigits(nf.format(Math.round(l.water_liter))),
        l.avg_temp == null ? "—" : faDigits(String(l.avg_temp)),
        w ? faDigits(nf.format(w.avg_weight_gr)) : "—",
      ];
    }),
  });

  /* ---------------------------------- پانویس ---------------------------------- */
  const pages = doc.bufferedPageRange?.() ?? { count: 1 };
  const totalPages = Math.max(1, (doc as any).bufferedPageRange ? (doc as any).bufferedPageRange().count : 1);
  doc.font("vazir").fontSize(8).fillColor(MUTED);
  doc.text(
    rtl(`مرغ‌یار — گزارش تولیدشده در ${formatJalali(report.meta.generatedAt.slice(0, 10))} · همه مبالغ به ریال`),
    left,
    doc.page.height - 26,
    { width: usable, align: "center" },
  );
  void pages;
  void totalPages;

  doc.end();
  return done;
}

interface TableColumn {
  label: string;
  width: number;
  align: "right" | "center" | "left";
}

function drawTable(
  doc: PDFKit.PDFDocument,
  opts: { title: string; right: number; left: number; y: number; columns: TableColumn[]; rows: string[][] },
) {
  let y = opts.y;
  if (y > doc.page.height - 90) {
    doc.addPage();
    y = 44;
  }
  doc.fillColor(INK).font("vazir-bold").fontSize(12);
  doc.text(rtl(opts.title), opts.right, y, { width: opts.right - opts.left, align: "right" });
  y += 18;

  const rowH = 18;
  const drawHeader = () => {
    let x = opts.right;
    doc.rect(opts.left, y - 2, opts.right - opts.left, rowH).fill("#e8f1ea");
    doc.fillColor(INK).font("vazir-bold").fontSize(8.5);
    for (const c of opts.columns) {
      doc.text(rtl(c.label), x - c.width, y + 3, { width: c.width - 6, align: c.align });
      x -= c.width;
    }
    y += rowH;
  };
  drawHeader();

  doc.font("vazir").fontSize(8.5);
  opts.rows.forEach((row, i) => {
    if (y > doc.page.height - 46) {
      doc.addPage();
      y = 44;
      drawHeader();
      doc.font("vazir").fontSize(8.5);
    }
    if (i % 2 === 1) doc.rect(opts.left, y - 2, opts.right - opts.left, rowH).fill("#f7faf8");
    let x = opts.right;
    doc.fillColor(INK);
    row.forEach((cell, ci) => {
      const c = opts.columns[ci];
      doc.text(rtl(cell), x - c.width, y + 3, { width: c.width - 6, align: c.align });
      x -= c.width;
    });
    y += rowH;
  });
}
