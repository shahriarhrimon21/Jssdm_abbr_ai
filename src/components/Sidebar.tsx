import { NAV } from "../nav.ts";
import type { ViewId } from "../nav.ts";
import Icon from "./Icon.tsx";
import Tooltip from "./Tooltip.tsx";

/**
 * Persistent desktop navigation, in regimental green.
 *
 * The active item is marked three ways at once — a gold inset rule, a
 * lifted surface, and a heavier weight — because a single colour change
 * is not enough for someone who cannot distinguish it (Phase 2 §12/§18).
 *
 * Collapsed, the rail keeps its icons and gains tooltips, so nothing
 * becomes unreachable; it is hidden entirely below the mobile breakpoint,
 * where BottomNav takes over.
 */
export default function Sidebar({
  active,
  onSelect,
  collapsed,
}: {
  active: ViewId;
  onSelect: (v: ViewId) => void;
  collapsed: boolean;
}) {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brandbar">
        <img className="logo" src="/logo-mark.png" alt="" width={32} height={32} />
        <span className="wm">
          <b>JSSDM ABBR StaffAI</b>
          <span>AI-Powered Staff Work Assistant</span>
        </span>
      </div>

      {NAV.map((group) => (
        <div className="side-group" key={group.label}>
          <div className="side-group-label">{group.label}</div>
          {group.items.map((item) => {
            const btn = (
              <button
                className={"navbtn" + (active === item.id ? " active" : "")}
                onClick={() => onSelect(item.id)}
                aria-current={active === item.id ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
              >
                <Icon name={item.icon} size={collapsed ? 24 : 18} />
                <span className="navlabel">{item.label}</span>
              </button>
            );
            // A tooltip is only useful once the label is gone; adding one
            // beside visible text would just repeat it. `key` sits on the
            // wrapper rather than on Tooltip so it is never mistaken for a
            // declared prop of that component.
            // Centred explicitly: collapsed, the button is a fixed 44px
            // square rather than a full-width bar (so the active/glass
            // background hugs the icon evenly on every side), and an
            // inline-flex child otherwise just left-aligns inside this
            // block wrapper instead of sitting in the middle of the rail.
            return (
              <div key={item.id} className={collapsed ? "navitem-collapsed" : undefined}>
                {collapsed ? (
                  <Tooltip label={item.label} placement="right">
                    {btn}
                  </Tooltip>
                ) : (
                  btn
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="side-foot">
        <div className="cite">
          JSSDM 2022 · Joint Services Staff Duties Manual
          <br />
          Service Writing
        </div>
      </div>
    </nav>
  );
}
