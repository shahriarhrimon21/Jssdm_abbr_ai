import { NAV } from "../nav.ts";
import type { ViewId } from "../nav.ts";
import Icon from "./Icon.tsx";

/**
 * The mobile "More" sheet — Tools and Reference, reachable in one tap
 * from the bottom bar.
 *
 * Rendered as a sheet rather than a full page so the user's place in the
 * workflow is preserved behind it: dismissing it returns them exactly
 * where they were, which a navigation *page* would not.
 */
export default function MoreSheet({
  active,
  onSelect,
  onClose,
}: {
  active: ViewId;
  onSelect: (v: ViewId) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="More destinations"
      onClick={onClose}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>More</h3>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        {NAV.slice(1).map((group) => (
          <div className="sheet-group" key={group.label}>
            <div className="sheet-group-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.id}
                className={"sheet-item" + (active === item.id ? " active" : "")}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                aria-current={active === item.id ? "page" : undefined}
              >
                <Icon name={item.icon} size={19} />
                {item.label}
                <Icon name="chevron-right" size={16} className="chev" />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
