import { ENTRIES, RULES, catList, svcList } from "../jssdm/database.ts";
import { getAllMessageHistory } from "../ai/messageHistory.ts";
import type { ViewId } from "../nav.ts";
import type { IconName } from "../components/Icon.tsx";
import Icon from "../components/Icon.tsx";

/**
 * Home — a point of departure, not a statistics page.
 *
 * Revised after the first pass read as a generic three-card dashboard:
 * equal weight on three unequal actions, no identity, no reason it
 * couldn't belong to any other app. Two changes fix that without adding
 * anything that isn't already true of the product:
 *
 *  1. A quiet identity band up top carries the crest — the one asset the
 *     whole product is built around — which previously appeared nowhere
 *     on this page. It is a letterhead, not a hero: one line, present
 *     once per landing, not competing with the actions beneath it.
 *
 *  2. "Abbreviate" is promoted to a single hero action instead of sitting
 *     as a peer of the other two. It is the deterministic, everyday path
 *     through this product — the thing most visits are actually for —
 *     and the layout says so before the copy does. "Draft with StaffAI"
 *     and "Browse history" become a secondary row beneath it.
 *
 * The verified/AI wording on each action (Phase 2 §3) is unchanged, and
 * so is the provenance strip, the engine explainer, and the corpus counts
 * — none of that was the problem; the shape around it was.
 */
interface SecondaryAction {
  id: ViewId;
  title: string;
  desc: string;
  icon: IconName;
  kind: "ai" | "plain";
}

const SECONDARY: SecondaryAction[] = [
  {
    id: "ai",
    title: "Draft with StaffAI",
    desc: "Get help writing or polishing a message, then run it through the manual.",
    icon: "ai",
    kind: "ai",
  },
  {
    id: "messageHistory",
    title: "Browse history",
    desc: "Find a message you finished earlier. The last 50 are kept on this device.",
    icon: "history",
    kind: "plain",
  },
];

export default function Dashboard({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  // "Continue recent work" hides itself entirely when there is nothing to
  // continue, rather than sitting there as a dead card — an empty action
  // teaches a first-time user that the interface is unreliable.
  const recent = getAllMessageHistory()[0];

  return (
    <div>
      <div className="home-band">
        <img className="home-band-crest" src="/logo-mark.svg" alt="" width={48} height={48} />
        <div className="home-band-text">
          <b>JSSDM ABBR StaffAI</b>
          <span>AI-Powered Staff Work Assistant</span>
        </div>
      </div>

      {recent && (
        <button className="continue-strip fade-in" onClick={() => onNavigate("messageHistory")}>
          <Icon name="forward" size={15} className="cs-icon" />
          <span>
            Continue:{" "}
            <span className="cs-snippet">
              {recent.finalMessage.slice(0, 64)}
              {recent.finalMessage.length > 64 ? "…" : ""}
            </span>
          </span>
          <Icon name="chevron-right" size={14} className="cs-chev" />
        </button>
      )}

      <div className="view-head">
        <div>
          <h2>What would you like to do?</h2>
          <div className="view-sub">
            JSSDM ABBR StaffAI turns everyday service correspondence into correct, abbreviated staff writing — with every abbreviation
            traceable to the manual.
          </div>
        </div>
      </div>

      <button className="hero-card" onClick={() => onNavigate("abbreviate")}>
        <span className="hero-ic">
          <Icon name="abbreviate" size={26} />
        </span>
        <span className="hero-copy">
          <h3>Abbreviate a message</h3>
          <p>Convert text using authorised JSSDM abbreviations, checked against the manual.</p>
        </span>
        <span className="hero-go">
          Start <Icon name="chevron-right" size={16} />
        </span>
      </button>

      <div className="sec-grid">
        {SECONDARY.map((a) => (
          <button key={a.id} className={"action-card compact" + (a.kind === "ai" ? " is-ai" : "")} onClick={() => onNavigate(a.id)}>
            <span className="ic-wrap">
              <Icon name={a.icon} size={18} />
            </span>
            <h4>{a.title}</h4>
            <p>{a.desc}</p>
            <span className="go">
              Start <Icon name="chevron-right" size={13} />
            </span>
          </button>
        ))}
      </div>

      <div className="section-rule">
        <h3>Where the data comes from</h3>
      </div>

      <div className="provenance-strip">
        <span className="pv">
          <b>{ENTRIES.length}</b>
          <span>Entries</span>
        </span>
        <span className="pv">
          <b>{RULES.length}</b>
          <span>Rules</span>
        </span>
        <span className="pv">
          <b>{catList().length}</b>
          <span>Categories</span>
        </span>
        <span className="pv">
          <b>{svcList().length}</b>
          <span>Forces</span>
        </span>
      </div>

      <div className="footer-note">
        Every abbreviation is resolved by a deterministic engine reading the JSSDM 2022 text extracted at build time — never by the AI. Terms
        that are not in the manual are left unchanged and reported as unverified. This is a reference tool, not an official issue or classified
        document.
      </div>
    </div>
  );
}
