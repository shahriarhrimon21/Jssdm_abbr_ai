import type { ReactNode } from "react";
import type { Span } from "../jssdm/types.ts";

/**
 * Renders text with highlighted spans as real React children — the
 * original vanilla-JS app built an HTML string (renderMarkedText) and
 * injected it; this renders the exact same visual result (same span
 * classes/titles) without ever touching innerHTML, so arbitrary pasted
 * text can never be interpreted as markup.
 */
export default function HighlightedText({ text, spans }: { text: string; spans: Span[] }) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((s, i) => {
    if (s.start < cursor) return;
    if (s.start > cursor) parts.push(text.slice(cursor, s.start));
    parts.push(
      <span key={i} className={s.cls} title={s.title || ""}>
        {text.slice(s.start, s.end)}
      </span>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <div className="text-block">{parts}</div>;
}
