import { useRef, useState, type ReactNode } from "react";

/**
 * Wraps a control with a short hover/focus label.
 *
 * Two rules this component exists to enforce, both from the Phase 2 brief:
 * a tooltip appears on FOCUS as well as hover, so it is not a mouse-only
 * affordance; and it never carries information available nowhere else,
 * because on a coarse pointer with no hover there may be no way to summon
 * it at all. Icon-only controls therefore also carry their own aria-label
 * — the tooltip is a convenience, the label is the accessible name.
 *
 * Positioned with `position: fixed` and coordinates computed here from
 * the trigger's own bounding box, rather than the simpler CSS-only
 * `position: absolute; top: 100%` this used before. That simpler version
 * was invisible on the collapsed sidebar: `.sidebar` sets
 * `overflow-y: auto`, and per the CSS Overflow spec a non-"visible"
 * overflow-y forces the paired overflow-x to compute to "auto" as well
 * — so anything overflowing the rail's own width, including a tooltip
 * centred under an icon 32px from the left edge, was silently clipped
 * rather than shown cut off. `position: fixed` escapes that clipping
 * (nothing here gives the sidebar its own containing block via
 * transform/filter/perspective), so this reaches the viewport intact.
 */
export default function Tooltip({
  label,
  children,
  placement = "below",
}: {
  label: string;
  children: ReactNode;
  placement?: "below" | "right";
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(
      placement === "right"
        ? { top: r.top + r.height / 2, left: r.right + 9 }
        : { top: r.bottom + 7, left: r.left + r.width / 2 },
    );
  }
  function hide() {
    setPos(null);
  }

  return (
    <span ref={wrapRef} className="tip" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && (
        <span
          className={"tip-body fade-in" + (placement === "right" ? " tip-right" : "")}
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
