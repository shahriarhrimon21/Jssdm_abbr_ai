import { useOnlineStatus } from "../hooks/useOnlineStatus.ts";

export default function Topbar({ debugMode, onToggleDebug }: { debugMode: boolean; onToggleDebug: () => void }) {
  const online = useOnlineStatus();
  return (
    <div className="topbar">
      <div className="brand">
        <h1>JSSDM Reference Desk</h1>
        <span className="cite">JSSDM 2022 · Joint Services Staff Duties Manual, Service Writing · Section 16</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Compact, global connectivity status — Part U: subtle, never an
            oversized banner. Icon + text, not color alone, so it reads even
            without color perception. Everything except AI features keeps
            working offline; this is purely informational. */}
        <span
          className={"status-pill " + (online ? "online" : "offline")}
          role="status"
          aria-live="polite"
          title={online ? "Online — AI features available" : "Offline — AI features unavailable; everything else still works"}
        >
          <span className="dot" aria-hidden="true" />
          {online ? "Online" : "Offline — AI unavailable"}
        </span>
        <button
          className="btn secondary small"
          onClick={onToggleDebug}
          title="Show a step-by-step trace of how each result was resolved"
        >
          {debugMode ? "Debug mode: ON" : "Debug mode: off"}
        </button>
        <div className="note">Reference tool grounded in the uploaded manual text — not an official issue or classified document.</div>
      </div>
    </div>
  );
}
