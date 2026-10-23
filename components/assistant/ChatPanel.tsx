"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Bot, User, Database, RefreshCw } from "lucide-react";
import Markdown from "@/components/Markdown";

interface Msg {
  role: "user" | "assistant";
  content: string;
  chips?: string[];
  usedData?: string[];
  engine?: string;
}

const STORAGE_KEY = "farm01-chat-v1";

export default function ChatPanel({
  greeting,
  quickQuestions,
  initialQuestion,
}: {
  greeting: string;
  quickQuestions: string[];
  initialQuestion?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const askedOnce = useRef(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !initialQuestion || askedOnce.current) return;
    askedOnce.current = true;
    if (!messages.some((m) => m.role === "user" && m.content === initialQuestion)) {
      void send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, initialQuestion]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* ignore */
    }
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, hydrated]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setError(null);
    const history = messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-8);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, history }),
      });
      if (!res.ok) throw new Error("خطا در پاسخ‌گیری");
      const data = (await res.json()) as { content: string; chips?: string[]; usedData?: string[]; engine?: string };
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.content, chips: data.chips, usedData: data.usedData, engine: data.engine },
      ]);
    } catch {
      setError("ارتباط با مشاور برقرار نشد. یک‌بار دیگر تلاش کنید.");
    } finally {
      setLoading(false);
      setTimeout(() => taRef.current?.focus(), 50);
    }
  };

  const lastChips = [...messages].reverse().find((m) => m.role === "assistant" && m.chips)?.chips ?? quickQuestions;

  return (
    <div className="card chat-card">
      <div className="chat-head">
        <span className="ai-avatar">
          <Sparkles size={18} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13.5 }}>مشاور هوشمند مرغ‌یار</div>
          <div className="tiny muted">تحلیل داده‌های همین مزرعه — فارسی و آفلاین</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          title="گفتگوی جدید"
          onClick={() => {
            setMessages([{ role: "assistant", content: greeting }]);
            setError(null);
          }}
        >
          <RefreshCw size={14} />
          گفتگوی جدید
        </button>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role === "user" ? "user" : ""}`}>
            <span className="msg-avatar">{m.role === "user" ? <User size={14} /> : <Bot size={14} />}</span>
            <div className="bubble">
              {m.role === "assistant" ? (
                <>
                  <Markdown content={m.content} />
                  {m.usedData?.length ? (
                    <div className="data-note">
                      <Database size={11} style={{ marginTop: 3 }} />
                      {m.usedData.map((d, k) => (
                        <span key={k}>{d}</span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {loading ? (
          <div className="msg">
            <span className="msg-avatar">
              <Bot size={14} />
            </span>
            <div className="bubble">
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
              <span className="tiny muted" style={{ marginInlineStart: 6 }}>
                در حال تحلیل داده‌های مزرعه…
              </span>
            </div>
          </div>
        ) : null}
        {error ? <div className="form-msg error">{error}</div> : null}
      </div>

      <div className="chips">
        {lastChips.slice(0, 4).map((q) => (
          <button key={q} className="chip" onClick={() => send(q)} disabled={loading}>
            {q}
          </button>
        ))}
      </div>

      <div className="chat-input-wrap">
        <textarea
          ref={taRef}
          className="chat-input"
          rows={1}
          placeholder="مثلاً: با توجه به وزن فعلی و قیمت بازار، بفروشم یا صبر کنم؟"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={loading}
        />
        <button className="send-btn" onClick={() => send(input)} disabled={loading || !input.trim()} aria-label="ارسال">
          <Send size={17} style={{ transform: "scaleX(-1)" }} />
        </button>
      </div>
    </div>
  );
}
