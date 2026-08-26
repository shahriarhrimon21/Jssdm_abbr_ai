import type { ReactNode } from "react";
import type { Span } from "../jssdm/types.ts";
import Icon from "./Icon.tsx";

/**
 * Engine output with its verification highlighting — the surface that
 * decides whether this tool reads as a reference instrument or merely a
 * convenience.
 *
 * Renders spans as real React children. The original vanilla-JS app built
 * an HTML string and injected it; this produces the same visual result
 * without ever touching innerHTML, so arbitrary pasted text can never be
 * interpreted as markup.
 *
 * Two Phase 2 requirements are structural here rather than cosmetic:
 *
 *  1. Status is never colour alone. Each class carries its own underline
 *     treatment in the stylesheet (solid / dashed / dotted), so the three
 *     states remain distinguishable in greyscale or with a colour-vision
 *     deficiency.
 *
 *  2. Evidence is reachable without a mouse. A `title` attribute is
 *     hover-only and invisible to touch and keyboard, so each span is
 *     additionally focusable and carries an accessible label with the same
 *     text — the source is reachable by Tab on a desktop and by tap on a
 *     phone.
 *
 * The `cls` values come from the frozen Span type and must not be
 * renamed; only their presentation is Phase 2's to change.
 */

const TALLY_META = {
  "hl-verified": { label: "verified", icon: "verified" as const },
  "hl-context": { label: "context-dependent", icon: "warning" as const },
  "hl-unverified": { label: "unresolved", icon: "unverified" as const },
};

export default function HighlightedText({
  text,
  spans,
  showTally = true,
}: {
  text: string;
  spans: Span[];
  /** The summary strip above the text — suppressed where a caller already
   *  shows its own counts, so the same numbers never appear twice. */
  showTally?: boolean;
}) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((s, i) => {
    if (s.start < cursor) return;
    if (s.start > cursor) parts.push(text.slice(cursor, s.start));
    const title = s.title || "";
    const body = text.slice(s.start, s.end);
    parts.push(
      <span
        key={i}
        className={s.cls}
        title={title}
        tabIndex={0}
        role="mark"
        aria-label={title ? `${body} — ${title}` : undefined}
      >
        {body}
      </span>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  // Counts are computed from the spans themselves rather than passed in,
  // so the summary can never drift out of step with what is rendered.
  const counts = sorted.reduce<Record<string, number>>((acc, s) => {
    acc[s.cls] = (acc[s.cls] || 0) + 1;
    return acc;
  }, {});
  const tallyRows = (Object.keys(TALLY_META) as Array<keyof typeof TALLY_META>).filter((k) => counts[k]);

  return (
    <>
      {showTally && tallyRows.length > 0 && (
        <div className="tally" role="status" aria-label="Result summary">
          {tallyRows.map((k) => (
            <span className="t" key={k}>
              <Icon name={TALLY_META[k].icon} size={15} />
              <b className="data-num">{counts[k]}</b> {TALLY_META[k].label}
            </span>
          ))}
        </div>
      )}
      <div className="text-block">{parts}</div>
    </>
  );
}
