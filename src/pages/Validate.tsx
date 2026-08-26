import { useMemo, useState } from "react";
import { runValidate, WRITING_TYPES } from "../jssdm/validation.ts";
import EvidenceBlockView from "../components/EvidenceBlockView.tsx";
import ForceSelect from "../components/ForceSelect.tsx";

const LEVEL_BADGE: Record<string, string> = { ok: "ok", warn: "warn", bad: "bad" };

export default function Validate({ force, setForce }: { force: string; setForce: (f: string) => void }) {
  const [input, setInput] = useState("");
  const [writingType, setWritingType] = useState<string>(WRITING_TYPES[1].id);
  const result = useMemo(() => (input.trim() ? runValidate(input, writingType, force) : null), [input, writingType, force]);

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Validate Usage</h2>
          <div className="view-sub">Checks abbreviation usage against the writing-type restrictions in Section 2 (e.g. allied correspondence, formal letters).</div>
        </div>
      </div>

      <div className="panel">
        <div className="field-row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="flabel" htmlFor="val-input">
              Document text
            </label>
            <textarea id="val-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste the text to validate..." />
          </div>
          <div>
            <label className="flabel" htmlFor="val-type">
              Writing type
            </label>
            <select id="val-type" value={writingType} onChange={(e) => setWritingType(e.target.value)}>
              {WRITING_TYPES.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <ForceSelect value={force} onChange={setForce} />
        </div>
      </div>

      {result && (
        <div className="panel">
          <h3>
            Overall: <span className={`badge badge-${LEVEL_BADGE[result.overall]}`}>{result.overall.toUpperCase()}</span>
          </h3>
          {result.findings.map((f, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              {f.block ? (
                <EvidenceBlockView block={f.block} />
              ) : (
                <div className={`result-block ${f.level}`}>{f.text}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
