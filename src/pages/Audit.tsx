import { useMemo, useState } from "react";
import { runAudit } from "../jssdm/audit.ts";
import StatusBadge from "../components/StatusBadge.tsx";
import ForceSelect from "../components/ForceSelect.tsx";

export default function Audit({ force, setForce }: { force: string; setForce: (f: string) => void }) {
  const [input, setInput] = useState("");
  const result = useMemo(() => (input.trim() ? runAudit(input, force) : null), [input, force]);

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Audit Document</h2>
          <div className="view-sub">A full pass over a document, counting verified, context-dependent, and unresolved abbreviations, plus any consistency issues.</div>
        </div>
      </div>

      <div className="panel">
        <div className="field-row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="flabel" htmlFor="aud-input">
              Document text
            </label>
            <textarea id="aud-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste the document to audit..." />
          </div>
          <ForceSelect value={force} onChange={setForce} />
        </div>
      </div>

      {result && (
        <div className="panel">
          <div className="kpi-grid">
            <div className="kpi">
              <div className="num data-num">{result.counts.ok}</div>
              <div className="lbl">Verified</div>
            </div>
            <div className="kpi">
              <div className="num data-num">{result.counts.context}</div>
              <div className="lbl">Context-dependent</div>
            </div>
            <div className="kpi">
              <div className="num data-num">{result.counts.unverified}</div>
              <div className="lbl">Unverified</div>
            </div>
            <div className="kpi">
              <div className="num data-num">{result.total}</div>
              <div className="lbl">Total tokens</div>
            </div>
          </div>

          <div className="tbl-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Token</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.n}>
                    <td className="data-num">{r.n}</td>
                    <td className="cell-abbr">{r.abbr}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="src">
                      {r.source}
                      {r.caseMismatch && ` — capitalization mismatch, expected: ${r.caseMismatch.expected.join(" / ")}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.consistency.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Consistency issues</h3>
              {result.consistency.map((c, i) => (
                <div className="rule-box" key={i}>
                  <strong>{c.concept}</strong>: {c.forms.map((f) => `"${f.surface}"`).join(", ")}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
