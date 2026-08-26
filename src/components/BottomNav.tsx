import { PRIMARY_NAV, NAV } from "../nav.ts";
import type { ViewId } from "../nav.ts";
import Icon from "./Icon.tsx";

/**
 * Mobile navigation.
 *
 * Bottom placement is not a style choice: it is the only region reachable
 * one-handed on a large phone, and unlike a top bar it survives the
 * browser chrome collapsing on scroll. The stylesheet pads it with
 * env(safe-area-inset-bottom) so it never sits under an iOS home
 * indicator.
 *
 * It carries the four Workflow destinations; the eight Tools and
 * Reference features live behind "More", so nothing is lost — only
 * demoted (Phase 2 §12).
 */
export default function BottomNav({
  active,
  onSelect,
  onMore,
  moreOpen,
}: {
  active: ViewId;
  onSelect: (v: ViewId) => void;
  onMore: () => void;
  moreOpen: boolean;
}) {
  // "More" reads as active whenever the current view is one of the items
  // it contains, so the bar never shows nothing selected.
  const inMore = NAV.slice(1).some((g) => g.items.some((i) => i.id === active));

  return (
    <nav className="bottomnav" aria-label="Primary">
      {PRIMARY_NAV.map((item) => (
        <button
          key={item.id}
          className={active === item.id && !moreOpen ? "active" : ""}
          onClick={() => onSelect(item.id)}
          aria-current={active === item.id ? "page" : undefined}
        >
          <Icon name={item.icon} size={21} />
          <span>{item.shortLabel || item.label}</span>
        </button>
      ))}
      <button
        className={moreOpen || (inMore && !moreOpen) ? "active" : ""}
        onClick={onMore}
        aria-expanded={moreOpen}
        aria-haspopup="menu"
      >
        <Icon name={moreOpen ? "close" : "more"} size={21} />
        <span>More</span>
      </button>
    </nav>
  );
}
