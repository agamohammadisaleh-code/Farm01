import { NextResponse } from "next/server";
import { getAssistantAnswer, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** محدودسازی ساده نرخ درخواست (ضد سوءاستفاده از هزینه مدل و منابع) */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (hits.size > 5000) hits.clear();
  return entry.count > RATE_MAX;
}

export async function POST(req: Request) {
  try {
    if (rateLimited(clientKey(req))) {
      return NextResponse.json(
        { error: "تعداد درخواست‌ها زیاد است؛ لطفاً یک دقیقه بعد تلاش کنید." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    const body = (await req.json()) as { message?: string; history?: ChatMessage[] };
    const message = (body.message ?? "").toString().slice(0, 1200).trim();
    if (!message) {
      return NextResponse.json({ error: "پیام خالی است." }, { status: 400 });
    }
    const history = Array.isArray(body.history)
      ? body.history
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
      : [];
    const answer = await getAssistantAnswer(message, history);
    return NextResponse.json(answer);
  } catch (e) {
    console.error("assistant error", e);
    return NextResponse.json({ error: "خطای داخلی مشاور" }, { status: 500 });
  }
}
