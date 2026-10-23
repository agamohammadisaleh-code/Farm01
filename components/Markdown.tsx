import React from "react";

/** رندر سبک مارک‌داون برای پاسخ‌های مشاور (بدون وابستگی خارجی) */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      out.push(<strong key={`${keyPrefix}-b-${i++}`}>{token.slice(2, -2)}</strong>);
    } else {
      out.push(
        <code key={`${keyPrefix}-c-${i++}`} style={{ background: "#f2f0e8", padding: "1px 5px", borderRadius: 5 }}>
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[][] | null = null;

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l-${blocks.length}`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `li-${blocks.length}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    blocks.push(
      <div key={`t-${blocks.length}`} style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i}>{inline(h, `th-${i}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{inline(c, `td-${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (list) flushList();
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return;
      table = table ?? [];
      table.push(cells);
      return;
    }
    flushTable();

    if (!line.trim()) {
      flushList();
      return;
    }
    if (line.startsWith("### ")) {
      flushList();
      blocks.push(<h3 key={`h-${idx}`}>{inline(line.slice(4), `h-${idx}`)}</h3>);
      return;
    }
    if (line.startsWith("#### ")) {
      flushList();
      blocks.push(<h4 key={`h-${idx}`}>{inline(line.slice(5), `h-${idx}`)}</h4>);
      return;
    }
    if (line.startsWith("&gt; ") || line.startsWith("> ")) {
      flushList();
      blocks.push(<blockquote key={`q-${idx}`}>{inline(line.replace(/^(&gt;|>)\s?/, ""), `q-${idx}`)}</blockquote>);
      return;
    }
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ol || ul) {
      const ordered = Boolean(ol);
      const text = ol ? ol[2] : ul![1];
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(text);
      return;
    }
    flushList();
    blocks.push(<p key={`p-${idx}`}>{inline(line, `p-${idx}`)}</p>);
  });
  flushList();
  flushTable();

  return <>{blocks}</>;
}
