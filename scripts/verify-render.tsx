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
import StatusBadge from "../src/components/StatusBadge.tsx";
import HighlightedText from "../src/components/HighlightedText.tsx";
import EvidenceBlockView from "../src/components/EvidenceBlockView.tsx";
import DebugTraceView from "../src/components/DebugTraceView.tsx";
import { traceAbbreviate } from "../src/jssdm/debug.ts";

const noop = () => {};

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
check("AIWritingAssistant", <AIWritingAssistant force="all" setForce={noop} />);
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

console.log(failures === 0 ? "\nAll component renders succeeded." : `\n${failures} component(s) FAILED to render.`);
process.exit(failures === 0 ? 0 : 1);
