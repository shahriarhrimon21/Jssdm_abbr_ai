import { useReducer, useState } from "react";
import Topbar from "./components/Topbar.tsx";
import Sidebar from "./components/Sidebar.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Abbreviate from "./pages/Abbreviate.tsx";
import Deabbreviate from "./pages/Deabbreviate.tsx";
import AIWritingAssistant from "./pages/AIWritingAssistant.tsx";
import SmartAbbreviate from "./pages/SmartAbbreviate.tsx";
import SmartHistory from "./pages/SmartHistory.tsx";
import Search from "./pages/Search.tsx";
import Validate from "./pages/Validate.tsx";
import Audit from "./pages/Audit.tsx";
import Consistency from "./pages/Consistency.tsx";
import Favorites from "./pages/Favorites.tsx";
import Rules from "./pages/Rules.tsx";
import Coverage from "./pages/Coverage.tsx";
import type { ViewId } from "./nav.ts";
import { assistantReducer, initialAssistantState } from "./ai/state.ts";
import { smartAbbreviateReducer, initialSmartAbbreviateState } from "./smartAbbreviate/state.ts";

export default function App() {
  const [view, setView] = useState<ViewId>("dashboard");
  const [force, setForce] = useState("all");
  const [debugMode, setDebugMode] = useState(false);

  // Lifted to App — the one component that never unmounts while the page
  // switches between features — so the AI Writing session (including the
  // Text/WhatsApp mode and any unsent draft text) survives navigating away
  // and back. See the comment at the top of src/ai/state.ts for why this
  // fixes the "AI Writing session is lost when navigating" bug at the
  // architecture level instead of patching around it.
  const [aiState, aiDispatch] = useReducer(assistantReducer, initialAssistantState);

  // Same lifted-state reasoning as aiState above — an in-progress Smart
  // Abbreviate message (original text, suggestions, hand-edits) must
  // survive navigating to History (or any other page) and back.
  const [smartState, smartDispatch] = useReducer(smartAbbreviateReducer, initialSmartAbbreviateState);

  let page;
  switch (view) {
    case "dashboard":
      page = <Dashboard onNavigate={setView} />;
      break;
    case "abbreviate":
      page = <Abbreviate force={force} setForce={setForce} debugMode={debugMode} />;
      break;
    case "deabbreviate":
      page = <Deabbreviate force={force} setForce={setForce} debugMode={debugMode} />;
      break;
    case "ai":
      page = <AIWritingAssistant force={force} setForce={setForce} state={aiState} dispatch={aiDispatch} />;
      break;
    case "smartAbbreviate":
      page = <SmartAbbreviate force={force} setForce={setForce} state={smartState} dispatch={smartDispatch} setView={setView} />;
      break;
    case "smartHistory":
      page = <SmartHistory force={force} dispatch={smartDispatch} setView={setView} />;
      break;
    case "search":
      page = <Search />;
      break;
    case "validate":
      page = <Validate force={force} setForce={setForce} />;
      break;
    case "audit":
      page = <Audit force={force} setForce={setForce} />;
      break;
    case "consistency":
      page = <Consistency force={force} setForce={setForce} />;
      break;
    case "favorites":
      page = <Favorites />;
      break;
    case "rules":
      page = <Rules />;
      break;
    case "coverage":
      page = <Coverage />;
      break;
    default:
      page = <Dashboard onNavigate={setView} />;
  }

  return (
    <div className="app">
      <Topbar debugMode={debugMode} onToggleDebug={() => setDebugMode((d) => !d)} />
      <Sidebar active={view} onSelect={setView} />
      <main className="main">
        <div>{page}</div>
        <div className="footer-note">
          All results are derived from the uploaded JSSDM 2022 text extracted at build time. Entries not present in the source are reported as
          unverified — never inferred from general knowledge.
        </div>
      </main>
    </div>
  );
}
