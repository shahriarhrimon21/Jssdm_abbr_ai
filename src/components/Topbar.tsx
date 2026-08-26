export default function Topbar({ debugMode, onToggleDebug }: { debugMode: boolean; onToggleDebug: () => void }) {
  return (
    <div className="topbar">
      <div className="brand">
        <h1>JSSDM Reference Desk</h1>
        <span className="cite">JSSDM 2022 · Joint Services Staff Duties Manual, Service Writing · Section 16</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
