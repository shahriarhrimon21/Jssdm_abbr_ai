import { useMemo } from "react";
import { buildCoverageReport } from "../jssdm/coverage.ts";

export default function Coverage() {
  const r = useMemo(() => buildCoverageReport(), []);

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>JSSDM Coverage Report</h2>
          <div className="view-sub">A corpus-wide, computed-live audit of the loaded dataset — including every reverse-mapping (Section 16 Annex B) collision, and how each was resolved.</div>
        </div>
      </div>

      <div className="panel">
        <div className="kpi-grid">
          <div className="kpi">
            <div className="num data-num">{r.totalEntries}</div>
            <div className="lbl">Total entries</div>
          </div>
          <div className="kpi">
            <div className="num data-num">{r.multiMeaningEntries}</div>
            <div className="lbl">Annex B multi-meaning</div>
          </div>
          <div className="kpi">
            <div className="num data-num">{r.reverseCollisionGroups.length}</div>
            <div className="lbl">Reverse collisions</div>
          </div>
          <div className="kpi">
            <div className="num data-num">{r.unresolvedFullFormCollisions.length}</div>
            <div className="lbl">Unresolved collisions</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Entries by notation type</h3>
        <div className="chip-row">
          {Object.entries(r.byNotation).map(([k, v]) => (
            <span className="chip" key={k}>
              {k}: {v}
            </span>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>Entries by category</h3>
        <div className="chip-row">
          {Object.entries(r.byCategory).map(([k, v]) => (
            <span className="chip" key={k}>
              {k}: {v}
            </span>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>Section 16 Annex B reverse-mapping collisions</h3>
        <p className="view-sub" style={{ marginBottom: 10 }}>
          A collision is any full-form text listed as a meaning of two or more different abbreviations in Annex B. Each is resolved to the
          least-overloaded (most specific) abbreviation when there is a unique one — otherwise every candidate is shown, never guessed. This is
          the mechanism behind the "Personnel → pers, not PA" fix.
        </p>
        {r.reverseCollisionGroups.map((g, i) => (
          <div className="rule-box" key={i}>
            <strong>{g.full}</strong> — {g.resolution === "resolved" ? "resolved" : "genuine tie (both shown)"}
            <div style={{ marginTop: 4 }}>
              {g.candidates.map((c, j) => (
                <span className="pill" key={j} style={{ marginRight: 6 }}>
                  {c.abbr} ({c.overload} meanings){c.preferred ? " — preferred" : c.tied ? " — tied" : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>Whole-corpus full-form collision scan</h3>
        <p className="view-sub" style={{ marginBottom: 10 }}>
          {r.fullFormCollisions.length} full-form texts map to more than one abbreviation across the entire dataset.{" "}
          {r.fullFormCollisions.length - r.unresolvedFullFormCollisions.length} are already handled correctly (either force-differentiated, or
          resolved by the Annex B mechanism above); {r.unresolvedFullFormCollisions.length} remain flagged below as a known, disclosed edge case.
        </p>
        {r.unresolvedFullFormCollisions.map((c, i) => (
          <div className="rule-box" key={i}>
            <strong>{c.full}</strong> — same-force duplicate, not yet resolved
            <div style={{ marginTop: 4 }}>
              {c.candidates.map((cand, j) => (
                <span className="pill" key={j} style={{ marginRight: 6 }}>
                  {cand.abbr} ({cand.service || "General"})
                </span>
              ))}
            </div>
          </div>
        ))}
        {r.unresolvedFullFormCollisions.length === 0 && <div className="empty">None — every collision is currently resolved.</div>}
      </div>
    </div>
  );
}
