import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { categoryLabel } from "@/lib/metrics";
import { formatJalali } from "@/lib/jalali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS: Record<string, string[]> = {
  costs: ["دوره", "تاریخ", "تاریخ شمسی", "دسته", "شرح", "مبلغ (تومان)", "مقدار", "واحد", "تأمین‌کننده"],
  logs: ["دوره", "تاریخ", "تاریخ شمسی", "تلفات", "حذف", "دان (کیلوگرم)", "آب (لیتر)", "دما", "وزن نمونه (گرم)", "یادداشت"],
  sales: ["دوره", "تاریخ", "تاریخ شمسی", "تعداد", "وزن (کیلوگرم)", "قیمت هر کیلو", "کسورات", "درآمد خالص", "خریدار"],
};

function esc(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!["costs", "logs", "sales"].includes(type)) {
    return NextResponse.json({ error: "نوع خروجی نامعتبر است" }, { status: 404 });
  }
  const db = getDb();
  const cycleNames = new Map(
    (db.prepare("SELECT id, name FROM cycles").all() as { id: number; name: string }[]).map((c) => [c.id, c.name]),
  );

  let rows: unknown[][] = [];
  if (type === "costs") {
    const data = db.prepare("SELECT * FROM costs ORDER BY date ASC").all() as Record<string, unknown>[];
    rows = data.map((r) => [
      cycleNames.get(Number(r.cycle_id)) ?? "",
      r.date,
      formatJalali(String(r.date)),
      categoryLabel(String(r.category)),
      r.description,
      r.amount,
      r.quantity ?? "",
      r.unit ?? "",
      r.vendor ?? "",
    ]);
  } else if (type === "logs") {
    const data = db.prepare("SELECT * FROM daily_logs ORDER BY date ASC").all() as Record<string, unknown>[];
    rows = data.map((r) => [
      cycleNames.get(Number(r.cycle_id)) ?? "",
      r.date,
      formatJalali(String(r.date)),
      r.mortality,
      r.culls,
      r.feed_kg,
      r.water_l,
      r.temp_c ?? "",
      r.avg_weight_g ?? "",
      r.notes ?? "",
    ]);
  } else {
    const data = db.prepare("SELECT * FROM sales ORDER BY date ASC").all() as Record<string, unknown>[];
    rows = data.map((r) => [
      cycleNames.get(Number(r.cycle_id)) ?? "",
      r.date,
      formatJalali(String(r.date)),
      r.count,
      r.weight_kg,
      r.price_per_kg,
      r.deductions,
      Number(r.weight_kg) * Number(r.price_per_kg) - Number(r.deductions),
      r.buyer ?? "",
    ]);
  }

  const csv = "\uFEFF" + [HEADERS[type].map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="farm-${type}.csv"`,
    },
  });
}
