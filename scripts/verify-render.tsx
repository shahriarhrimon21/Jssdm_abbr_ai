/**
 * Ad-hoc verification script (not part of the shipped app) — server-renders
 * every page/component with representative props via react-dom/server to
 * catch real JSX/import/runtime errors before delivery, since `npm install`
 * + `vite build` cannot run in this authoring sandbox. Run with:
 *   tsx scripts/verify-render.tsx
 */
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App.tsx";
import Dashboard from "../src/pages/Dashboard.tsx";
import Abbreviate from "../src/pages/Abbreviate.tsx";
import Deabbreviate from "../src/pages/Deabbreviate.tsx";
import Search from "../src/pages/Search.tsx";
import Validate from "../src/pages/Validate.tsx";
import Audit from "../src/pages/Audit.tsx";
import Consistency from "../src/pages/Consistency.tsx";
import Favorites from "../src/pages/Favorites.tsx";
import Rules from "../src/pages/Rules.tsx";
import Coverage from "../src/pages/Coverage.tsx";
import AIWritingAssistant from "../src/pages/AIWritingAssistant.tsx";
import MessageHistory from "../src/pages/MessageHistory.tsx";
import StatusBadge from "../src/components/StatusBadge.tsx";
import Sidebar from "../src/components/Sidebar.tsx";
import Topbar from "../src/components/Topbar.tsx";
import BottomNav from "../src/components/BottomNav.tsx";
import MoreSheet from "../src/components/MoreSheet.tsx";
import Footer from "../src/components/Footer.tsx";
import Icon, { ALL_ICON_NAMES } from "../src/components/Icon.tsx";
import HighlightedText from "../src/components/HighlightedText.tsx";
import EvidenceBlockView from "../src/components/EvidenceBlockView.tsx";
import DebugTraceView from "../src/components/DebugTraceView.tsx";
import { traceAbbreviate } from "../src/jssdm/debug.ts";
import { initialAssistantState } from "../src/ai/state.ts";
import { addNewMessageHistoryRecord } from "../src/ai/messageHistory.ts";

const noop = () => {};

// MessageHistory / AIWritingAssistant's save controls touch localStorage at
// render/interaction time (ai/messageHistory.ts) — Node has no global
// localStorage, so this script needs the same tiny in-memory polyfill the
// unit tests use, purely so the render pass below can exercise a page with
// at least one real saved record instead of only the empty-state path.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
(globalThis as any).localStorage = new MemoryStorage();
addNewMessageHistoryRecord({
  messageType: "text",
  original: "Troop movement report.",
  aiFinal: "The Troop movement was reported to command.",
  aiEditedDraft: null,
  jssdmGenerated: "The tp movement was reported to comd.",
  finalEdited: "The tp movement was reported to comd at 0900.",
});

let failures = 0;
function check(name: string, el: any) {
  try {
    const html = renderToStaticMarkup(el);
    if (!html || html.length < 1) throw new Error("empty render output");
    console.log(`OK   ${name} (${html.length} chars)`);
  } catch (e: any) {
    failures++;
    console.error(`FAIL ${name}:`, e.message);
    console.error(e.stack);
  }
}

check("App (full shell)", <App />);
check("Dashboard", <Dashboard onNavigate={noop} />);
check("Abbreviate", <Abbreviate force="all" setForce={noop} debugMode={true} />);
check("Deabbreviate", <Deabbreviate force="all" setForce={noop} debugMode={true} />);
check("Search", <Search />);
check("Validate", <Validate force="all" setForce={noop} />);
check("Audit", <Audit force="all" setForce={noop} />);
check("Consistency", <Consistency force="all" setForce={noop} />);
check("Favorites", <Favorites />);
check("Rules", <Rules />);
check("Coverage", <Coverage />);
check("AIWritingAssistant (text mode)", <AIWritingAssistant force="all" setForce={noop} state={initialAssistantState} dispatch={noop} />);
check(
  "AIWritingAssistant (whatsapp mode, with a live session)",
  <AIWritingAssistant
    force="all"
    setForce={noop}
    state={{
      ...initialAssistantState,
      outputMode: "whatsapp",
      signature: "BM",
      draftInput: "let sir know troops moved",
      original: "let sir know troops moved",
      aiFinal: "Assalamualaikum Sir,\n\nTroops have moved.\n\nRegards\nBM",
      aiEditedDraft: "Assalamualaikum Sir,\n\nTroops have moved successfully.\n\nRegards\nBM",
      jssdmGenerated: "Assalamualaikum Sir,\n\nTps have mov successfully.\n\nRegards\nBM",
      jssdmGeneratedSpans: [],
      finalEdited: "Assalamualaikum Sir,\n\nTps have mov successfully at 0900.\n\nRegards\nBM",
      chat: [
        { role: "user", content: "let sir know troops moved" },
        { role: "assistant", content: "Assalamualaikum Sir,\n\nTroops have moved.\n\nRegards\nBM" },
      ],
    }}
    dispatch={noop}
  />,
);
check("Sidebar (expanded)", <Sidebar active="dashboard" onSelect={noop} collapsed={false} />);
check("Sidebar (collapsed)", <Sidebar active="abbreviate" onSelect={noop} collapsed={true} />);
check("Topbar", <Topbar title="Home" force="all" setForce={noop} onToggleSidebar={noop} sidebarCollapsed={false} />);
check("BottomNav", <BottomNav active="dashboard" onSelect={noop} onMore={noop} moreOpen={false} />);
check("MoreSheet", <MoreSheet active="validate" onSelect={noop} onClose={noop} />);
check("Footer", <Footer />);
check("Icon (every name)", <>{ALL_ICON_NAMES.map((n) => <span key={n}><Icon name={n} /></span>)}</>);
check("StatusBadge ok", <StatusBadge status="ok" />);
check("StatusBadge rule", <StatusBadge status="rule" />);
check("HighlightedText", <HighlightedText text="Personnel are en route" spans={[{ start: 0, end: 9, cls: "hl-verified", title: "test" }]} />);
check(
  "EvidenceBlockView cap-issue",
  <EvidenceBlockView block={{ kind: "cap-issue", entered: "TK", expected: "tk", reason: "r", source: "s" }} />,
);
check(
  "EvidenceBlockView verified",
  <EvidenceBlockView block={{ kind: "verified", label: "Verified", input: "tk", result: "Tank", reason: "r", reference: "ref" }} />,
);
check(
  "EvidenceBlockView rule-supported",
  <EvidenceBlockView block={{ kind: "rule-supported", input: "tps", result: "Troops", reason: "r", reference: "ref" }} />,
);
check("DebugTraceView", <DebugTraceView trace={traceAbbreviate("Personnel", "all")} />);
check(
  "AIWritingAssistant (with setView / Message History link + Save controls)",
  <AIWritingAssistant
    force="all"
    setForce={noop}
    state={{
      ...initialAssistantState,
      original: "Troop movement report.",
      aiFinal: "The Troop movement was reported to command.",
      aiEditedDraft: "The Troop movement was reported to command.",
      jssdmGenerated: "The tp movement was reported to comd.",
      jssdmGeneratedSpans: [],
      finalEdited: "The tp movement was reported to comd.",
      loadedHistoryRecordId: "mh_test",
    }}
    dispatch={noop}
    setView={noop}
  />,
);
check("MessageHistory (with a saved record)", <MessageHistory dispatch={noop} setView={noop} />);

console.log(failures === 0 ? "\nAll component renders succeeded." : `\n${failures} component(s) FAILED to render.`);
process.exit(failures === 0 ? 0 : 1);
