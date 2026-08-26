import { useEffect, useReducer, useState } from "react";
import Topbar from "./components/Topbar.tsx";
import Sidebar from "./components/Sidebar.tsx";
import BottomNav from "./components/BottomNav.tsx";
import MoreSheet from "./components/MoreSheet.tsx";
import Footer from "./components/Footer.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Abbreviate from "./pages/Abbreviate.tsx";
import Deabbreviate from "./pages/Deabbreviate.tsx";
import AIWritingAssistant from "./pages/AIWritingAssistant.tsx";
import MessageHistory from "./pages/MessageHistory.tsx";
import Search from "./pages/Search.tsx";
import Validate from "./pages/Validate.tsx";
import Audit from "./pages/Audit.tsx";
import Consistency from "./pages/Consistency.tsx";
import Favorites from "./pages/Favorites.tsx";
import Rules from "./pages/Rules.tsx";
import Coverage from "./pages/Coverage.tsx";
import type { ViewId } from "./nav.ts";
import { NAV_LABELS } from "./nav.ts";
import { assistantReducer, initialAssistantState } from "./ai/state.ts";
import { useTheme } from "./hooks/useTheme.ts";

const LS_SIDEBAR = "jssdm_sidebar_collapsed_v1";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(LS_SIDEBAR) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const [view, setView] = useState<ViewId>("dashboard");
  const [force, setForce] = useState("all");
  const [debugMode, setDebugMode] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [moreOpen, setMoreOpen] = useState(false);

  // Applies the persisted theme to <html> on mount. Called here rather
  // than only inside Topbar so the attribute is set even on a route that
  // does not render the toggle.
  useTheme();

  // Lifted to App — the one component that never unmounts while the page
  // switches between features — so the AI Writing session (including the
  // Text/WhatsApp mode and any unsent draft text) survives navigating away
  // and back. See the comment at the top of src/ai/state.ts for why this
  // fixes the "AI Writing session is lost when navigating" bug at the
  // architecture level instead of patching around it.
  const [aiState, aiDispatch] = useReducer(assistantReducer, initialAssistantState);

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(LS_SIDEBAR, next ? "1" : "0");
      } catch {
        /* best-effort — the choice still applies for this session */
      }
      return next;
    });
  }

  // Esc closes the mobile sheet, matching every other dismissible surface.
  useEffect(() => {
    if (!moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  function navigate(v: ViewId) {
    setView(v);
    setMoreOpen(false);
  }

  let page;
  switch (view) {
    case "dashboard":
      page = <Dashboard onNavigate={navigate} />;
      break;
    case "abbreviate":
      page = <Abbreviate force={force} setForce={setForce} debugMode={debugMode} />;
      break;
    case "deabbreviate":
      page = <Deabbreviate force={force} setForce={setForce} debugMode={debugMode} />;
      break;
    case "ai":
      page = <AIWritingAssistant force={force} setForce={setForce} state={aiState} dispatch={aiDispatch} setView={navigate} />;
      break;
    case "messageHistory":
      page = <MessageHistory dispatch={aiDispatch} setView={navigate} />;
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
      page = <Dashboard onNavigate={navigate} />;
  }

  // NAV_LABELS already maps "dashboard" to "Home", so no special case is
  // needed. The explicit ViewId annotation keeps the index typed even
  // where React's own types are unavailable to infer it.
  const title: string = NAV_LABELS[view as ViewId] || "Home";

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <Sidebar active={view} onSelect={navigate} collapsed={collapsed} />
      <div className="shell-content">
        <Topbar
          title={title}
          force={force}
          setForce={setForce}
          onToggleSidebar={toggleSidebar}
          sidebarCollapsed={collapsed}
        />
        <main className="main">{page}</main>
        <Footer />
      </div>
      <BottomNav active={view} onSelect={navigate} onMore={() => setMoreOpen((o) => !o)} moreOpen={moreOpen} />
      {moreOpen && <MoreSheet active={view} onSelect={navigate} onClose={() => setMoreOpen(false)} />}
    </div>
  );
}
