import { useState } from "react";
import { RULES } from "../jssdm/database.ts";

export default function Rules() {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? RULES.filter((r) => (r.title + " " + r.text + " " + r.code).toLowerCase().includes(q.trim().toLowerCase()))
    : RULES;

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Manual Rules</h2>
          <div className="view-sub">Every rule the engine cites, extracted directly from Section 2 and Section 16 of JSSDM 2022.</div>
        </div>
      </div>

      <div className="panel">
        <label className="flabel" htmlFor="rules-q">
          Filter
        </label>
        <input id="rules-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rule text..." />
      </div>

      {filtered.map((r) => (
        <div className="panel" key={r.id}>
          <h3>
            {r.code} — {r.title}
          </h3>
          <p style={{ margin: "0 0 8px" }}>{r.text}</p>
          <div className="src">{r.source}</div>
        </div>
      ))}
    </div>
  );
}
