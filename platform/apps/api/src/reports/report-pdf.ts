import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";
import { formatJalali, toman } from "@farm/domain";
import type { FlockReport } from "./reports.service";
import { tokenize } from "./rtl-text";

/**
 * خروجی PDF فارسی (راست‌به‌چپ).
 *
 * شکل‌دهی حروف عربی/فارسی را خود pdfkit (از طریق fontkit) انجام می‌دهد، ولی
 * ترتیب دوجهته را نه — هر واژه را جدا می‌چیند و واژه‌ها را چپ‌به‌راست می‌گذارد.
 * پس واژه‌ها را خودمان می‌شکنیم و از راست به چپ رسم می‌کنیم (جزئیات در
 * `rtl-text.ts`). فونت وزیرمتن جاسازی می‌شود تا فایل همه‌جا یکسان دیده شود.
 */

const localRequire = createRequire(__filename);

let fontDir = "";
try {
  fontDir = join(dirname(localRequire.resolve("vazirmatn/package.json")), "fonts", "ttf");
} catch {
  fontDir = join(process.cwd(), "node_modules", "vazirmatn", "fonts", "ttf");
}
const FONT_REGULAR = join(fontDir, "Vazirmatn-Regular.ttf");
const FONT_BOLD = join(fontDir, "Vazirmatn-Bold.ttf");

/**
 * قالب عدد در گزارش چاپی: سه‌رقمی با ارقام لاتین.
 * دلیل ارقام لاتین در `rtl-text.ts` توضیح داده شده (محدودیت fontkit در
 * چیدن ارقام فارسی داخل متن راست‌به‌چپ).
 */
export const faDigits = (value: string | number) => String(value);

export const faNumber = (value: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

const GREEN = "#2f7d5b";
const INK = "#1d2b23";
const MUTED = "#6b7a72";
const LINE = "#d8e2dc";

type Align = "right" | "left" | "center";

interface TextStyle {
  size?: number;
  bold?: boolean;
  color?: string;
}

/**
 * رسم یک خط فارسی. واژه‌ها از راست به چپ چیده می‌شوند:
 * اولین واژه در سمت راست کادر و آخرین واژه در سمت چپ.
 */
function drawLine(
  doc: PDFKit.PDFDocument,
  text: string,
  box: { left: number; right: number; y: number },
  align: Align = "right",
  style: TextStyle = {},
): number {
  doc.font(style.bold ? "vazir-bold" : "vazir").fontSize(style.size ?? 9).fillColor(style.color ?? INK);
  const space = doc.widthOfString(" ");
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0;

  const widths = tokens.map((t) => doc.widthOfString(t));
  const total = widths.reduce((a, b) => a + b, 0) + space * (tokens.length - 1);

  let x: number;
  if (align === "right") x = box.right - total;
  else if (align === "center") x = box.left + (box.right - box.left - total) / 2;
  else x = box.left;

  for (let i = 0; i < tokens.length; i++) {
    doc.text(tokens[i], x, box.y, { lineBreak: false });
    // پرانتزهای جدا‌شده فاصله کمتری می‌گیرند تا «( گرم )» به «(گرم)» نزدیک شود
    const isBracket = /^[()[\]]$/.test(tokens[i]);
    const nextIsBracket = i + 1 < tokens.length && /^[()[\]]$/.test(tokens[i + 1]);
    x += widths[i] + (isBracket || nextIsBracket ? space * 0.25 : space);
  }
  return total;
}

export async function buildFlockPdf(report: FlockReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 34,
    // برای نوشتن شماره صفحه در پایان باید صفحات در بافر بمانند
    bufferPages: true,
    info: { Title: `گزارش ${report.meta.flockName}`, Author: "Farm" },
  });
  doc.registerFont("vazir", FONT_REGULAR);
  doc.registerFont("vazir-bold", FONT_BOLD);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = 34;
  const right = doc.page.width - 34;
  const usable = right - left;
  const m = report.summary;

  /* --------------------------------- سربرگ --------------------------------- */
  doc.rect(0, 0, doc.page.width, 76).fill(GREEN);
  drawLine(doc, "گزارش دوره پرورش", { left: right - 420, right, y: 14 }, "right", { size: 18, bold: true, color: "#ffffff" });
  drawLine(
    doc,
    `${report.meta.farmName} · ${report.meta.hallName} · ${report.meta.flockName}`,
    { left: right - 560, right, y: 44 },
    "right",
    { size: 10, color: "#d9f0e4" },
  );
  drawLine(doc, `تاریخ گزارش: ${formatJalali(report.meta.generatedAt.slice(0, 10))}`, { left, right: left + 300, y: 20 }, "left", { size: 9, color: "#e7f4ec" });
  drawLine(doc, `شروع دوره: ${report.meta.startDateJalali}`, { left, right: left + 300, y: 38 }, "left", { size: 9, color: "#e7f4ec" });
  drawLine(doc, `سن گله: ${faNumber(report.meta.ageDays)} روز`, { left, right: left + 300, y: 56 }, "left", { size: 9, color: "#e7f4ec" });

  /* --------------------------------- شاخص‌ها --------------------------------- */
  let y = 90;
  drawLine(doc, "شاخص‌های کلیدی", { left, right, y }, "right", { size: 13, bold: true });
  y += 22;

  const cards = [
    { label: "قطعه زنده", value: faNumber(m.liveBirds), hint: `از ${faNumber(m.flock.initial_count)} قطعه` },
    { label: "وزن فعلی", value: `${faNumber(m.currentWeightG)} گرم`, hint: `استاندارد ${faNumber(m.stdWeightG)}` },
    { label: "ضریب تبدیل", value: m.fcr == null ? "—" : faDigits(m.fcr.toFixed(2)), hint: `استاندارد ${faDigits(m.stdFcr.toFixed(2))}` },
    { label: "تلفات", value: `${faDigits(m.mortalityPct.toFixed(1))}٪`, hint: `استاندارد ${faDigits(m.expectedMortalityPct.toFixed(1))}٪` },
    { label: "یکنواختی", value: m.uniformityPct == null ? "—" : `${faNumber(m.uniformityPct)}٪`, hint: m.avgUniformityPct ? `میانگین ${faNumber(m.avgUniformityPct)}٪` : "بدون نمونه" },
    { label: "هزینه هر کیلو", value: m.costPerKgLive ? faNumber(Math.round(m.costPerKgLive)) : "—", hint: "ریال بر کیلوگرم زنده" },
  ];

  const gap = 8;
  const cardW = (usable - gap * (cards.length - 1)) / cards.length;
  const cardH = 64;
  cards.forEach((card, i) => {
    const x = right - (i + 1) * cardW - i * gap;
    doc.roundedRect(x, y, cardW, cardH, 6).fillAndStroke("#f5f9f6", LINE);
    const box = { left: x + 8, right: x + cardW - 8, y: 0 };
    drawLine(doc, card.label, { ...box, y: y + 8 }, "right", { size: 8.5, color: MUTED });
    drawLine(doc, card.value, { ...box, y: y + 23 }, "right", { size: 14, bold: true });
    drawLine(doc, card.hint, { ...box, y: y + 47 }, "right", { size: 7.5, color: MUTED });
  });
  y += cardH + 20;

  /* -------------------------------- ترکیب هزینه -------------------------------- */
  drawLine(doc, "ترکیب هزینه", { left, right, y }, "right", { size: 13, bold: true });
  y += 22;
  const labelW = 120;
  const amountW = 200;
  const barW = usable - labelW - amountW - 30;
  for (const slice of m.costBreakdown.slice(0, 6)) {
    drawLine(doc, slice.label, { left: right - labelW, right, y }, "right", { size: 9, color: MUTED });
    const barLeft = right - labelW - 14 - barW;
    doc.rect(barLeft, y + 1, barW, 9).fill("#eef2ef");
    doc.rect(barLeft, y + 1, Math.max(2, (slice.share / 100) * barW), 9).fill(slice.color);
    drawLine(doc, `${faDigits(slice.share.toFixed(1))}٪ · ${faDigits(toman(Math.round(slice.amount)))}`, { left, right: left + amountW, y }, "left", { size: 8.5 });
    y += 16;
  }
  y += 10;

  /* ------------------------------ خلاصه مالی ------------------------------ */
  drawLine(doc, "خلاصه مالی", { left, right, y }, "right", { size: 13, bold: true });
  y += 22;
  const financial: [string, string][] = [
    ["هزینه کل", `${faDigits(toman(Math.round(m.totalCost)))} ریال`],
    ["درآمد فروش", `${faDigits(toman(Math.round(m.revenue)))} ریال`],
    ["سود یا زیان ثبت‌شده", `${faDigits(toman(Math.round(m.netProfit)))} ریال`],
    ["سود پیش‌بینی پایان دوره", `${faDigits(toman(Math.round(m.projection.projectedProfit)))} ریال`],
    ["وزن پیش‌بینی پایان دوره", `${faNumber(m.projection.projectedWeightG)} گرم`],
    ["دان مصرف‌شده", `${faNumber(Math.round(m.totalFeedKg))} کیلوگرم`],
  ];
  const colW = usable / 2;
  financial.forEach(([label, value], i) => {
    const column = i % 2;
    const rowIdx = Math.floor(i / 2);
    const colRight = right - column * colW;
    const colLeft = colRight - colW;
    const yy = y + rowIdx * 20;
    if (rowIdx % 2 === 0) doc.rect(colLeft + 6, yy - 4, colW - 12, 19).fill("#f7faf8");
    drawLine(doc, label, { left: colLeft + 150, right: colRight - 12, y: yy }, "right", { size: 9, color: MUTED });
    drawLine(doc, value, { left: colLeft + 12, right: colLeft + 146, y: yy }, "left", { size: 9, bold: true });
  });
  y += Math.ceil(financial.length / 2) * 20 + 18;

  /* -------------------------------- ثبت روزانه -------------------------------- */
  const columns = [
    { label: "تاریخ", width: 92, align: "right" as Align },
    { label: "تلفات", width: 56, align: "center" as Align },
    { label: "حذف", width: 50, align: "center" as Align },
    { label: "دان (کیلوگرم)", width: 104, align: "center" as Align },
    { label: "آب (لیتر)", width: 92, align: "center" as Align },
    { label: "دما", width: 60, align: "center" as Align },
    { label: "وزن (گرم)", width: 92, align: "center" as Align },
  ];
  const rows = report.tables.logs.slice(-10).map((l) => {
    const w = report.tables.weights.find((x) => x.date === l.date);
    return [
      formatJalali(l.date),
      faNumber(l.mortality),
      faNumber(l.cull),
      faNumber(Math.round(l.feed_kg)),
      faNumber(Math.round(l.water_liter)),
      l.avg_temp == null ? "—" : faDigits(l.avg_temp),
      w ? faNumber(w.avg_weight_gr) : "—",
    ];
  });

  const needTableHeight = 30 + (rows.length + 1) * 19;
  if (y + needTableHeight > doc.page.height - 40) {
    doc.addPage();
    y = 40;
  }
  drawLine(doc, "ثبت روزانه (۱۰ روز آخر)", { left, right, y }, "right", { size: 13, bold: true });
  y += 22;

  const rowH = 19;
  const drawHeader = () => {
    doc.rect(left, y - 2, usable, rowH).fill("#e8f1ea");
    let colRight = right;
    for (const c of columns) {
      drawLine(doc, c.label, { left: colRight - c.width + 4, right: colRight - 4, y: y + 4 }, c.align, { size: 8.5, bold: true });
      colRight -= c.width;
    }
    y += rowH;
  };
  drawHeader();

  rows.forEach((row, i) => {
    if (y > doc.page.height - 40) {
      doc.addPage();
      y = 40;
      drawHeader();
    }
    if (i % 2 === 1) doc.rect(left, y - 2, usable, rowH).fill("#f7faf8");
    let colRight = right;
    row.forEach((cell, ci) => {
      const c = columns[ci];
      drawLine(doc, cell, { left: colRight - c.width + 4, right: colRight - 4, y: y + 4 }, c.align, { size: 8.5 });
      colRight -= c.width;
    });
    y += rowH;
  });

  /* ---------------------------------- پانویس ---------------------------------- */
  const range = doc.bufferedPageRange();
  const totalPages = Math.max(1, range.count);
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    drawLine(
      doc,
      `مرغ‌یار · گزارش ${formatJalali(report.meta.generatedAt.slice(0, 10))} · همه مبالغ به ریال · صفحه ${faNumber(i + 1)} از ${faNumber(totalPages)}`,
      { left, right, y: doc.page.height - 26 },
      "center",
      { size: 7.5, color: MUTED },
    );
  }

  doc.end();
  return done;
}
