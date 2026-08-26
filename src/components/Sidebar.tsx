import { NAV } from "../nav.ts";
import type { ViewId } from "../nav.ts";

export default function Sidebar({ active, onSelect }: { active: ViewId; onSelect: (v: ViewId) => void }) {
  return (
    <nav className="sidebar">
      {NAV.map((group) => (
        <div key={group.label}>
          <div className="side-group-label">{group.label}</div>
          {group.items.map((item) => (
            <button
              key={item.id}
              className={"navbtn" + (active === item.id ? " active" : "")}
              onClick={() => onSelect(item.id)}
            >
              <span className="ic">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
