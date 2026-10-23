import ExcelJS from "exceljs";
import { formatJalali, num, toman } from "@farm/domain";
import type { FlockReport } from "./reports.service";

/**
 * خروجی Excel.
 *
 * هر برگه راست‌به‌چپ است (`views: [{ rightToLeft: true }]`) تا ستون اول در
 * سمت راست دیده شود. اعداد به‌صورت عددی نوشته می‌شوند (نه متن) تا کاربر
 * بتواند در Excel جمع و نمودار بگیرد؛ قالب نمایش سه‌رقمی فارسی جدا است.
 */

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F7D5B" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Vazirmatn" };
const BODY_FONT: Partial<ExcelJS.Font> = { name: "Vazirmatn", size: 11 };

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[]) {
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true },
  });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = HEADER_FONT;
  head.fill = HEADER_FILL;
  head.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
  head.height = 24;
  return ws;
}

function styleBody(ws: ExcelJS.Worksheet, numericKeys: string[] = []) {
  ws.eachRow((row, index) => {
    if (index === 1) return;
    row.font = BODY_FONT;
    row.alignment = { horizontal: "right", vertical: "middle", readingOrder: "rtl" };
    for (const key of numericKeys) {
      const cell = row.getCell(key);
      cell.alignment = { horizontal: "left", readingOrder: "rtl" };
      cell.numFmt = "#,##0";
    }
    if (index % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7F4" } };
      });
    }
  });
}

export async function buildFlockExcel(report: FlockReport, categoryLabel: (key: string) => string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "مرغ‌یار";
  wb.created = new Date();
  const m = report.summary;

  /* ---------------------------------- خلاصه ---------------------------------- */
  const summary = sheet(wb, "خلاصه", [
    { header: "شاخص", key: "k", width: 34 },
    { header: "مقدار", key: "v", width: 22 },
    { header: "توضیح", key: "note", width: 46 },
  ]);
  const rows: [string, string | number, string][] = [
    ["مزرعه", report.meta.farmName, ""],
    ["سالن", report.meta.hallName, ""],
    ["گله", report.meta.flockName, report.meta.breed],
    ["تاریخ جوجه‌ریزی", report.meta.startDateJalali, report.meta.startDate],
    ["سن گله (روز)", m.ageDays, `هدف: ${m.targetAge} روز`],
    ["وضعیت", report.meta.status === "closed" ? "بسته" : "فعال", report.meta.closedDate ? formatJalali(report.meta.closedDate) : ""],
    ["قطعه زنده", m.liveBirds, `اولیه: ${num(m.flock.initial_count)}`],
    ["تلفات و حذف (٪)", Number(m.mortalityPct.toFixed(2)), `استاندارد: ${m.expectedMortalityPct.toFixed(2)}٪`],
    ["وزن فعلی (گرم)", m.currentWeightG, m.weightSource === "measured" ? "اندازه‌گیری‌شده" : "برآوردی"],
    ["وزن استاندارد (گرم)", m.stdWeightG, `انحراف: ${m.weightVsStdPct.toFixed(1)}٪`],
    ["ضریب تبدیل (FCR)", m.fcr == null ? "—" : Number(m.fcr.toFixed(3)), `استاندارد: ${m.stdFcr.toFixed(3)}`],
    ["یکنواختی (٪)", m.uniformityPct ?? "—", m.avgUniformityPct ? `میانگین دوره: ${m.avgUniformityPct}٪` : "بدون نمونه کافی"],
    ["کل دان مصرفی (کیلوگرم)", Math.round(m.totalFeedKg), ""],
    ["کل آب مصرفی (لیتر)", Math.round(m.totalWaterL), ""],
    ["هزینه کل (ریال)", Math.round(m.totalCost), ""],
    ["هزینه هر کیلوگرم زنده (ریال)", m.costPerKgLive ? Math.round(m.costPerKgLive) : "—", ""],
    ["درآمد فروش (ریال)", Math.round(m.revenue), ""],
    ["سود/زیان (ریال)", Math.round(m.netProfit), m.netProfit >= 0 ? "سود" : "زیان"],
    ["سود پیش‌بینی‌شده پایان دوره", Math.round(m.projection.projectedProfit), `وزن پیش‌بینی: ${m.projection.projectedWeightG} گرم`],
  ];
  rows.forEach(([k, v, note]) => summary.addRow({ k, v, note }));
  styleBody(summary, ["v"]);

  /* -------------------------------- ثبت روزانه -------------------------------- */
  const logs = sheet(wb, "ثبت روزانه", [
    { header: "تاریخ", key: "date", width: 14 },
    { header: "تلفات", key: "mortality", width: 10 },
    { header: "حذف", key: "cull", width: 10 },
    { header: "دان (کیلوگرم)", key: "feed", width: 16 },
    { header: "آب (لیتر)", key: "water", width: 14 },
    { header: "دما (C)", key: "temp", width: 10 },
    { header: "نوع دان", key: "feedType", width: 16 },
    { header: "یادداشت", key: "notes", width: 40 },
  ]);
  for (const l of report.tables.logs) {
    logs.addRow({
      date: formatJalali(l.date),
      mortality: l.mortality,
      cull: l.cull,
      feed: l.feed_kg,
      water: l.water_liter,
      temp: l.avg_temp ?? "",
      feedType: (l as any).feed_type ?? "",
      notes: l.notes ?? "",
    });
  }
  styleBody(logs, ["mortality", "cull", "feed", "water", "temp"]);

  /* ---------------------------------- وزن ---------------------------------- */
  const weights = sheet(wb, "وزن‌گیری", [
    { header: "تاریخ", key: "date", width: 14 },
    { header: "روز دوره", key: "day", width: 12 },
    { header: "تعداد نمونه", key: "count", width: 14 },
    { header: "میانگین (گرم)", key: "avg", width: 16 },
    { header: "کمینه (گرم)", key: "min", width: 14 },
    { header: "بیشینه (گرم)", key: "max", width: 14 },
    { header: "CV (٪)", key: "cv", width: 12 },
    { header: "یکنواختی (٪)", key: "uniformity", width: 16 },
  ]);
  for (const w of report.tables.weights) {
    weights.addRow({
      date: formatJalali(w.date),
      day: Math.max(1, Math.round((Date.parse(w.date) - Date.parse(report.meta.startDate)) / 86400_000) + 1),
      count: w.sample_count,
      avg: w.avg_weight_gr,
      min: w.min_weight_gr ?? "",
      max: w.max_weight_gr ?? "",
      cv: w.cv_pct ?? "",
      uniformity: w.uniformity_pct ?? "",
    });
  }
  styleBody(weights, ["day", "count", "avg", "min", "max", "cv", "uniformity"]);

  /* --------------------------------- سلامت --------------------------------- */
  const health = sheet(wb, "سلامت", [
    { header: "نوع", key: "kind", width: 14 },
    { header: "نام", key: "name", width: 28 },
    { header: "تاریخ برنامه", key: "scheduled", width: 16 },
    { header: "تاریخ انجام", key: "done", width: 16 },
    { header: "دوز", key: "dose", width: 20 },
    { header: "پرهیز (روز)", key: "withdrawal", width: 14 },
    { header: "وضعیت", key: "status", width: 14 },
  ]);
  for (const v of report.tables.vaccinations) {
    health.addRow({
      kind: "واکسن",
      name: v.name,
      scheduled: formatJalali(v.scheduled_date),
      done: v.done_date ? formatJalali(v.done_date) : "",
      dose: "",
      withdrawal: "",
      status: v.status === "done" ? "انجام‌شده" : v.status === "skipped" ? "رد‌شده" : "برنامه‌ریزی‌شده",
    });
  }
  for (const md of report.tables.medications) {
    health.addRow({
      kind: "دارو",
      name: md.name,
      scheduled: formatJalali(md.start_date),
      done: md.end_date ? formatJalali(md.end_date) : "",
      dose: md.dose,
      withdrawal: md.withdrawal_days ?? "",
      status: "",
    });
  }
  styleBody(health, ["withdrawal"]);

  /* --------------------------------- هزینه‌ها --------------------------------- */
  const costs = sheet(wb, "هزینه‌ها", [
    { header: "تاریخ", key: "date", width: 14 },
    { header: "دسته", key: "category", width: 20 },
    { header: "شرح", key: "description", width: 40 },
    { header: "مبلغ (ریال)", key: "amount", width: 20 },
    { header: "مقدار", key: "quantity", width: 12 },
    { header: "واحد", key: "unit", width: 12 },
    { header: "فروشنده", key: "vendor", width: 22 },
  ]);
  for (const e of report.tables.expenses) {
    costs.addRow({
      date: formatJalali(e.date),
      category: categoryLabel(e.category),
      description: e.description,
      amount: e.amount,
      quantity: e.quantity ?? "",
      unit: e.unit ?? "",
      vendor: e.vendor ?? "",
    });
  }
  styleBody(costs, ["amount", "quantity"]);

  /* ---------------------------------- فروش ---------------------------------- */
  const sales = sheet(wb, "فروش", [
    { header: "تاریخ", key: "date", width: 14 },
    { header: "تعداد", key: "count", width: 12 },
    { header: "وزن کل (کیلوگرم)", key: "weight", width: 18 },
    { header: "قیمت هر کیلو (ریال)", key: "price", width: 20 },
    { header: "کسورات (ریال)", key: "deductions", width: 16 },
    { header: "مبلغ خالص (ریال)", key: "net", width: 20 },
    { header: "خریدار", key: "buyer", width: 24 },
  ]);
  for (const s of report.tables.sales) {
    const net = s.total_weight_kg * s.price_per_kg - (s.deductions ?? 0);
    sales.addRow({
      date: formatJalali(s.date),
      count: s.count ?? "",
      weight: s.total_weight_kg,
      price: s.price_per_kg,
      deductions: s.deductions ?? 0,
      net,
      buyer: s.buyer ?? "",
    });
  }
  styleBody(sales, ["count", "weight", "price", "deductions", "net"]);

  /* -------------------------------- ترکیب هزینه -------------------------------- */
  const breakdown = sheet(wb, "ترکیب هزینه", [
    { header: "دسته", key: "label", width: 24 },
    { header: "مبلغ (ریال)", key: "amount", width: 22 },
    { header: "سهم (٪)", key: "share", width: 14 },
  ]);
  for (const slice of m.costBreakdown) {
    breakdown.addRow({ label: slice.label, amount: Math.round(slice.amount), share: Number(slice.share.toFixed(2)) });
  }
  styleBody(breakdown, ["amount", "share"]);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export async function buildFarmExcel(
  report: { meta: { farmName: string; asOf: string; generatedAt: string }; overview: any },
  categoryLabel: (key: string) => string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "مرغ‌یار";

  const ws = sheet(wb, "گله‌ها", [
    { header: "گله", key: "name", width: 26 },
    { header: "سن (روز)", key: "age", width: 12 },
    { header: "قطعه زنده", key: "live", width: 14 },
    { header: "تلفات (٪)", key: "mortality", width: 12 },
    { header: "وزن (گرم)", key: "weight", width: 14 },
    { header: "FCR", key: "fcr", width: 10 },
    { header: "یکنواختی (٪)", key: "uniformity", width: 14 },
    { header: "هزینه هر کیلو (ریال)", key: "costPerKg", width: 22 },
    { header: "درآمد (ریال)", key: "revenue", width: 20 },
    { header: "سود (ریال)", key: "profit", width: 20 },
  ]);
  for (const m of report.overview.activeMetrics) {
    ws.addRow({
      name: m.flock.name,
      age: m.ageDays,
      live: m.liveBirds,
      mortality: Number(m.mortalityPct.toFixed(2)),
      weight: m.currentWeightG,
      fcr: m.fcr == null ? "" : Number(m.fcr.toFixed(3)),
      uniformity: m.uniformityPct ?? "",
      costPerKg: m.costPerKgLive ? Math.round(m.costPerKgLive) : "",
      revenue: Math.round(m.revenue),
      profit: Math.round(m.netProfit),
    });
  }
  styleBody(ws, ["age", "live", "mortality", "weight", "fcr", "uniformity", "costPerKg", "revenue", "profit"]);

  const totals = sheet(wb, "جمع مزرعه", [
    { header: "شاخص", key: "k", width: 32 },
    { header: "مقدار", key: "v", width: 24 },
  ]);
  const o = report.overview;
  totals.addRow({ k: "مزرعه", v: report.meta.farmName });
  totals.addRow({ k: "تاریخ گزارش", v: formatJalali(report.meta.asOf) });
  totals.addRow({ k: "گله‌های فعال", v: o.activeMetrics.length });
  totals.addRow({ k: "قطعه زنده", v: o.liveBirds });
  totals.addRow({ k: "هزینه فعال (ریال)", v: Math.round(o.activeCost) });
  totals.addRow({ k: "سود تحقق‌یافته (ریال)", v: Math.round(o.realizedProfit) });
  totals.addRow({ k: "سود پیش‌بینی‌شده (ریال)", v: Math.round(o.activeProjectedProfit) });
  totals.addRow({ k: "کل دان مصرفی (کیلوگرم)", v: Math.round(o.totalFeed) });
  styleBody(totals, ["v"]);

  const breakdown = sheet(wb, "ترکیب هزینه", [
    { header: "دسته", key: "label", width: 24 },
    { header: "مبلغ (ریال)", key: "amount", width: 22 },
    { header: "سهم (٪)", key: "share", width: 14 },
  ]);
  for (const slice of o.costBreakdown ?? []) {
    breakdown.addRow({ label: slice.label ?? categoryLabel(slice.key), amount: Math.round(slice.amount), share: Number(slice.share.toFixed(2)) });
  }
  styleBody(breakdown, ["amount", "share"]);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
