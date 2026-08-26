import { useOnlineStatus } from "../hooks/useOnlineStatus.ts";
import { useTheme } from "../hooks/useTheme.ts";
import ForceSelect from "./ForceSelect.tsx";
import Icon from "./Icon.tsx";
import Tooltip from "./Tooltip.tsx";

/**
 * Contextual bar over the working area.
 *
 * Carries only what belongs at application scope: where you are, the
 * global Force selection, whether the AI is reachable, and the theme.
 * Debug tracing — previously marooned here — has moved to Settings, and
 * the long provenance note that used to sit on the right has moved to the
 * sidebar foot where it does not compete with the page title.
 *
 * Force is global rather than per-page (Phase 2 §12): it changes results
 * across six features, and repeating it on each one invites a user to set
 * contradictory values and then not understand why two screens disagree.
 */
export default function Topbar({
  title,
  force,
  setForce,
  onToggleSidebar,
  sidebarCollapsed,
}: {
  title: string;
  force: string;
  setForce: (f: string) => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}) {
  const online = useOnlineStatus();
  const { cycle, resolved } = useTheme();

  return (
    <header className="topbar">
      <Tooltip label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
        <button
          className="iconbtn hide-mobile"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!sidebarCollapsed}
        >
          <Icon name="sidebar" size={19} />
        </button>
      </Tooltip>

      {/* On phones the sidebar is gone, so the top bar carries the mark. */}
      <span className="brandbar-mobile show-mobile">
        <img src="/logo-mark.svg" alt="" width={26} height={26} />
      </span>

      <h2 className="page-title">{title}</h2>

      <div className="spacer" />

      <div className="topbar-tools">
        <div className="field-inline hide-mobile">
          <ForceSelect value={force} onChange={setForce} inline />
        </div>

        {/* Icon + text, never colour alone. Offline is a supported mode
            here, not a fault, so it is not styled as an error. */}
        <span
          className={"status-pill " + (online ? "online" : "offline")}
          role="status"
          aria-live="polite"
          title={
            online
              ? "Online — AI features available"
              : "Offline — AI is unavailable; abbreviation, validation, search and history all still work"
          }
        >
          <Icon name={online ? "online" : "offline"} size={14} />
          <span className="hide-narrow">{online ? "Online" : "Offline"}</span>
        </span>

        <Tooltip label={resolved === "dark" ? "Switch to light" : "Switch to dark"}>
          <button
            className="iconbtn"
            onClick={cycle}
            aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            <Icon name={resolved === "dark" ? "theme-light" : "theme-dark"} size={19} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
