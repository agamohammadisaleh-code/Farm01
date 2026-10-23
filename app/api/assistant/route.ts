import { NextResponse } from "next/server";
import { getAssistantAnswer, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
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
