import { useMemo, useState } from "react";
import { runDeabbreviate } from "../jssdm/deabbreviationEngine.ts";
import { traceDeabbreviate } from "../jssdm/debug.ts";
import HighlightedText from "../components/HighlightedText.tsx";
import StatusBadge from "../components/StatusBadge.tsx";
import DebugTraceView from "../components/DebugTraceView.tsx";
import ForceSelect from "../components/ForceSelect.tsx";

export default function Deabbreviate({ force, setForce, debugMode }: { force: string; setForce: (f: string) => void; debugMode: boolean }) {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => (input.trim() ? runDeabbreviate(input, force) : null), [input, force]);

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
          <h2>De-abbreviate Text</h2>
          <div className="view-sub">Abbreviations → full form. Case-sensitive per Section 2, Para 0241b(8); a capitalization mismatch is flagged, never silently accepted.</div>
        </div>
      </div>

      <div className="panel">
        <div className="field-row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="flabel" htmlFor="deabbr-input">
              Text to de-abbreviate
            </label>
            <textarea id="deabbr-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type or paste abbreviated text here..." />
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
                    <th>Abbreviation</th>
                    <th>Full form</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="cell-abbr">{r.original}</td>
                      <td>
                        {r.entries.length > 1 ? r.entries.map((e) => e.full).join(" / ") : r.full}
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="src">
                        {r.source}
                        {debugMode && <DebugTraceView trace={traceDeabbreviate(r.original, force)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.flagged.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Unresolved tokens</h3>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.flagged.map((f, i) => (
                      <tr key={i}>
                        <td className="cell-abbr">{f.token}</td>
                        <td className="src">
                          {f.caseMismatch
                            ? `Capitalization mismatch — expected: ${f.caseMismatch.expected.join(" / ")}`
                            : f.suggestions && f.suggestions.length
                              ? `No exact entry. Closest: ${f.suggestions.map((s) => s.abbr).join(", ")}`
                              : "No authoritative entry found in the uploaded manual — cannot verify."}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
