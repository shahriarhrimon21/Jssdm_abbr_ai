import { useMemo, useState } from "react";
import { runAbbreviate } from "../jssdm/abbreviationEngine.ts";
import { traceAbbreviate } from "../jssdm/debug.ts";
import HighlightedText from "../components/HighlightedText.tsx";
import StatusBadge from "../components/StatusBadge.tsx";
import DebugTraceView from "../components/DebugTraceView.tsx";
import ForceSelect from "../components/ForceSelect.tsx";

export default function Abbreviate({ force, setForce, debugMode }: { force: string; setForce: (f: string) => void; debugMode: boolean }) {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => (input.trim() ? runAbbreviate(input, force) : null), [input, force]);

  function copyOutput() {
    if (!result) return;
    navigator.clipboard?.writeText(result.output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Abbreviate Text</h2>
          <div className="view-sub">Full-form service writing → JSSDM-authorized abbreviations. Anything not explicitly listed or rule-supported is left unchanged.</div>
        </div>
      </div>

      <div className="panel">
        <div className="field-row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="flabel" htmlFor="abbr-input">
              Text to abbreviate
            </label>
            <textarea id="abbr-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type or paste full-form text here..." />
          </div>
          <ForceSelect value={force} onChange={setForce} />
        </div>
        <div className="btnrow">
          <button className="btn secondary small" onClick={() => setInput("")}>
            Clear
          </button>
        </div>
      </div>

      {result && (
        <div className="panel">
          <h3>Result</h3>
          <HighlightedText text={result.output} spans={result.outSpans} />
          <div className="btnrow" style={{ marginTop: 10 }}>
            <button className="btn small" onClick={copyOutput}>
              Copy result
            </button>
            {copied && <span className="copyok">Copied.</span>}
          </div>

          {result.rows.length > 0 && (
            <div className="tbl-wrap" style={{ marginTop: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th>Original</th>
                    <th>Abbreviation</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.original}</td>
                      <td className="cell-abbr">{r.abbr}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="src">
                        {r.source}
                        {debugMode && <DebugTraceView trace={traceAbbreviate(r.original, force)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.rows.length === 0 && <div className="empty">No JSSDM-authorized abbreviations matched in this text.</div>}
        </div>
      )}
    </div>
  );
}
