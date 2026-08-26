import { useMemo, useState } from "react";
import { checkConsistency } from "../jssdm/consistency.ts";
import ForceSelect from "../components/ForceSelect.tsx";

export default function Consistency({ force, setForce }: { force: string; setForce: (f: string) => void }) {
  const [input, setInput] = useState("");
  const issues = useMemo(() => (input.trim() ? checkConsistency(input, force) : []), [input, force]);

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Consistency Check</h2>
          <div className="view-sub">Flags the same concept written more than one way in a single document (rule 0241a(3)) — different abbreviations, or full form mixed with an abbreviation.</div>
        </div>
      </div>

      <div className="panel">
        <div className="field-row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="flabel" htmlFor="con-input">
              Document text
            </label>
            <textarea id="con-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste the document to check..." />
          </div>
          <ForceSelect value={force} onChange={setForce} />
        </div>
      </div>

      {input.trim() && (
        <div className="panel">
          <h3>
            Issues <span className="pill">{issues.length}</span>
          </h3>
          {issues.length === 0 && <div className="empty">No inconsistent usage detected.</div>}
          {issues.map((c, i) => (
            <div className="rule-box" key={i}>
              <strong>{c.concept}</strong>
              <div style={{ marginTop: 4 }}>
                {c.forms.map((f, j) => (
                  <span className="pill" key={j} style={{ marginRight: 6 }}>
                    "{f.surface}" × {f.count}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
