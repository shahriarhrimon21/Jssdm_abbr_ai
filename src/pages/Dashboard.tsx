import { ENTRIES, RULES, catList, svcList } from "../jssdm/database.ts";
import type { ViewId } from "../nav.ts";

const CARDS: Array<{ id: ViewId; title: string; desc: string }> = [
  { id: "abbreviate", title: "Abbreviate Text", desc: "Convert full-form service writing into JSSDM-authorized abbreviations." },
  { id: "deabbreviate", title: "De-abbreviate Text", desc: "Expand abbreviations back to their full authorized meaning." },
  { id: "ai", title: "AI Writing Assistant", desc: "Polish or draft prose, then run it straight through the JSSDM engine." },
  { id: "search", title: "Search / Reverse Lookup", desc: "Look up any abbreviation or full form directly." },
  { id: "validate", title: "Validate Usage", desc: "Check a document against the writing-type rules (formal, allied, etc.)." },
  { id: "audit", title: "Audit Document", desc: "Full pass over a document: verified, context-dependent, and unresolved." },
  { id: "consistency", title: "Consistency Check", desc: "Flag the same concept written two different ways in one document." },
  { id: "coverage", title: "JSSDM Coverage Report", desc: "Corpus-wide data audit: entry counts, collisions, what's resolved." },
];

export default function Dashboard({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Dashboard</h2>
          <div className="view-sub">Every result below is grounded in the uploaded JSSDM 2022 text extracted at build time.</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="num data-num">{ENTRIES.length}</div>
          <div className="lbl">Entries</div>
        </div>
        <div className="kpi">
          <div className="num data-num">{RULES.length}</div>
          <div className="lbl">Rules</div>
        </div>
        <div className="kpi">
          <div className="num data-num">{catList().length}</div>
          <div className="lbl">Categories</div>
        </div>
        <div className="kpi">
          <div className="num data-num">{svcList().length}</div>
          <div className="lbl">Forces</div>
        </div>
      </div>

      <div className="panel">
        <h3>Tools</h3>
        <div className="dash-grid">
          {CARDS.map((c) => (
            <div className="dash-card" key={c.id} onClick={() => onNavigate(c.id)}>
              <span className="ic">→</span>
              <h4>{c.title}</h4>
              <p>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
