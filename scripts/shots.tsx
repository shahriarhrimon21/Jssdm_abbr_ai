/**
 * Capture pass for the Phase 2 redesign. Renders the real App shell and
 * key pages through react-dom/server and screenshots them in headless
 * Chromium at every viewport and both themes.
 *
 * Run:  npx tsx scripts/shots.tsx [filter]
 */
import { renderToStaticMarkup } from "react-dom/server";
import Sidebar from "../src/components/Sidebar.tsx";
import Topbar from "../src/components/Topbar.tsx";
import BottomNav from "../src/components/BottomNav.tsx";
import MoreSheet from "../src/components/MoreSheet.tsx";
import Footer from "../src/components/Footer.tsx";
import Dashboard from "../src/pages/Dashboard.tsx";
import AIWritingAssistant from "../src/pages/AIWritingAssistant.tsx";
import { initialAssistantState } from "../src/ai/state.ts";
import { addNewMessageHistoryRecord } from "../src/ai/messageHistory.ts";
import type { ViewId } from "../src/nav.ts";
import { NAV_LABELS } from "../src/nav.ts";
import { shoot } from "./shoot.mjs";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();

// Node 22 defines a global `navigator` whose `onLine` is undefined, so the
// connectivity pill would server-render as "Offline" in every shot and
// misrepresent the normal state. Pinned to online here; the offline
// treatment is captured deliberately by its own job below.
try {
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
} catch {
  /* if it cannot be stubbed the shots simply show the offline pill */
}
addNewMessageHistoryRecord({
  messageType: "whatsapp",
  original: "Inform sir the patrol party reached the location.",
  aiFinal: "Assalamualaikum Sir,\n\nThe patrol party has reached the designated location at 1600 hrs.\n\nFor your kind info, sir.\nRegards",
  aiEditedDraft: null,
  jssdmGenerated: "Assalamualaikum Sir,\n\nThe patrol party has reached the desig loc at 1600 hrs.\n\nFor your kind info, sir.\nRegards",
  finalEdited: "Assalamualaikum Sir,\n\nThe patrol party has reached the desig loc at 1600 hrs.\n\nFor your kind info, sir.\nRegards",
});

const noop = () => {};

/** The real app shell, with a page slotted into it. */
function Shell({
  view,
  children,
  collapsed = false,
  mobile = false,
  moreOpen = false,
}: {
  view: ViewId;
  children: any;
  collapsed?: boolean;
  mobile?: boolean;
  moreOpen?: boolean;
}) {
  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <Sidebar active={view} onSelect={noop} collapsed={collapsed} />
      <div className="shell-content">
        <Topbar title={view === "dashboard" ? "Home" : NAV_LABELS[view]} force="all" setForce={noop} onToggleSidebar={noop} sidebarCollapsed={collapsed} />
        <main className="main">{children}</main>
        <Footer />
      </div>
      {mobile && <BottomNav active={view} onSelect={noop} onMore={noop} moreOpen={moreOpen} />}
      {moreOpen && <MoreSheet active={view} onSelect={noop} onClose={noop} />}
    </div>
  );
}

const WORKSPACE_STATE = {
  ...initialAssistantState,
  outputMode: "whatsapp" as const,
  signature: "Maj Rahman",
  original: "Inform sir that the patrol party reached the designated location at 1600 hrs.",
  aiFinal:
    "Assalamualaikum Sir,\n\nThe patrol party has reached the designated location at 1600 hrs.\n\nFor your kind info, sir.\nRegards\nMaj Rahman",
  aiEditedDraft:
    "Assalamualaikum Sir,\n\nThe patrol party has reached the designated location at 1600 hrs and reported no incident.\n\nFor your kind info, sir.\nRegards\nMaj Rahman",
  jssdmGenerated:
    "Assalamualaikum Sir,\n\nThe patrol party has reached the desig loc at 1600 hrs and reported no incident.\n\nFor your kind info, sir.\nRegards\nMaj Rahman",
  jssdmGeneratedSpans: [
    { start: 58, end: 62, cls: "hl-verified" as const, title: "designated → desig (JSSDM 2022 · 16A-4)" },
    { start: 63, end: 66, cls: "hl-verified" as const, title: "location → loc (JSSDM 2022 · 16A-9)" },
  ],
  finalEdited:
    "Assalamualaikum Sir,\n\nThe patrol party has reached the desig loc at 1600 hrs and reported no incident.\n\nFor your kind info, sir.\nRegards\nMaj Rahman",
};

const home = <Dashboard onNavigate={noop} />;
const workspace = <AIWritingAssistant force="all" setForce={noop} state={WORKSPACE_STATE} dispatch={noop} setView={noop} />;

const jobs: any[] = [];
function add(name: string, node: any, viewport: string, theme: "light" | "dark", fullPage = true) {
  jobs.push({ name, html: renderToStaticMarkup(node), viewport, theme, fullPage });
}

/* desktop */
for (const vp of ["desktop-1920", "desktop-1440", "desktop-1366"]) {
  add(`home-${vp}-light`, <Shell view="dashboard">{home}</Shell>, vp, "light");
  add(`home-${vp}-dark`, <Shell view="dashboard">{home}</Shell>, vp, "dark");
}
add("home-1440-collapsed-light", <Shell view="dashboard" collapsed>{home}</Shell>, "desktop-1440", "light");
add("home-1440-collapsed-dark", <Shell view="dashboard" collapsed>{home}</Shell>, "desktop-1440", "dark");
// Close-ups of the collapsed rail's glass active-state (correction 3),
// on a non-Home item so the frosted chip is visible against a different
// icon than the one used in the other collapsed shots above.
add("sidebar-collapsed-glass-light", <Shell view="ai" collapsed>{workspace}</Shell>, "desktop-1440", "light", false);
add("sidebar-collapsed-glass-dark", <Shell view="ai" collapsed>{workspace}</Shell>, "desktop-1440", "dark", false);
add("workspace-1440-light", <Shell view="ai">{workspace}</Shell>, "desktop-1440", "light");
add("workspace-1440-dark", <Shell view="ai">{workspace}</Shell>, "desktop-1440", "dark");
add("workspace-1920-light", <Shell view="ai">{workspace}</Shell>, "desktop-1920", "light");

/* tablet */
add("home-tablet-port-light", <Shell view="dashboard" mobile>{home}</Shell>, "tablet-port", "light");
add("home-tablet-land-light", <Shell view="dashboard">{home}</Shell>, "tablet-land", "light");

/* phone */
add("home-phone-light", <Shell view="dashboard" mobile>{home}</Shell>, "phone-port", "light");
add("home-phone-viewport", <Shell view="dashboard" mobile>{home}</Shell>, "phone-port", "light", false);
add("home-phone-dark", <Shell view="dashboard" mobile>{home}</Shell>, "phone-port", "dark");
add("home-phone-small-light", <Shell view="dashboard" mobile>{home}</Shell>, "phone-small", "light");
add("workspace-phone-light", <Shell view="ai" mobile>{workspace}</Shell>, "phone-port", "light");
add("workspace-phone-dark", <Shell view="ai" mobile>{workspace}</Shell>, "phone-port", "dark");
add("more-phone-light", <Shell view="validate" mobile moreOpen>{home}</Shell>, "phone-port", "light");
add("home-phone-land-light", <Shell view="dashboard" mobile>{home}</Shell>, "phone-land", "light");

const filter = process.argv[2];
const run = filter ? jobs.filter((j) => j.name.includes(filter)) : jobs;
const written = await shoot(run);
console.log(`captured ${written.length}:`);
written.forEach((w: string) => console.log("  " + w.split("/").pop()));
