/**
 * Renders every icon at the three sizes it is used at, so the whole set can
 * be inspected as a family before any of it ships. Run:
 *   npx tsx scripts/icon-sheet.tsx
 */
import { renderToStaticMarkup } from "react-dom/server";
import Icon, { ALL_ICON_NAMES } from "../src/components/Icon.tsx";
import { shoot } from "./shoot.mjs";

const css = `
*{box-sizing:border-box}
body{margin:0;padding:28px;background:#FBFAF6;color:#161D18;
  font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:13px}
h2{font-family:"IBM Plex Sans Condensed",sans-serif;font-size:15px;margin:0 0 4px;letter-spacing:.02em}
.sub{color:#77837B;font-size:12px;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}
.cell{border:1px solid #DEDACE;border-radius:8px;background:#fff;padding:12px 8px;text-align:center}
.row{display:flex;align-items:flex-end;justify-content:center;gap:12px;height:34px;color:#0A2A1E}
.nm{margin-top:9px;font-family:"IBM Plex Mono",monospace;font-size:10px;color:#4E5A53;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ctx{margin-top:22px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.btn{display:inline-flex;align-items:center;gap:7px;background:#0A2A1E;color:#FBFAF6;
  border:1px solid #0A2A1E;border-radius:6px;padding:8px 14px;font-size:13.5px;font-weight:600}
.btn.sec{background:#fff;color:#161D18;border-color:#C6C1B1;font-weight:500}
.btn.gold{background:#C9A227;border-color:#C9A227;color:#161D18}
.btn.maroon{background:#780C24;border-color:#780C24;color:#FBFAF6}
.nav{margin-top:22px;width:240px;background:#0A2A1E;border-radius:10px;padding:10px 8px}
.nav .it{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:6px;
  color:#CFE0D5;font-size:13.5px}
.nav .it.on{background:rgba(201,162,39,.16);color:#F2E4BC;box-shadow:inset 2px 0 0 #C9A227}
`;

const sheet = (
  <>
    <h2>Icon set — 40 marks, one family</h2>
    <p className="sub">Each shown at 24 / 20 / 16&nbsp;px. 24×24 grid, 2px stroke, round caps, currentColor.</p>
    <div className="grid">
      {ALL_ICON_NAMES.map((n) => (
        <div className="cell" key={n}>
          <div className="row">
            <Icon name={n} size={24} />
            <Icon name={n} size={20} />
            <Icon name={n} size={16} />
          </div>
          <div className="nm">{n}</div>
        </div>
      ))}
    </div>

    <div className="ctx">
      <span className="btn"><Icon name="ai" size={16} />Generate</span>
      <span className="btn sec"><Icon name="copy" size={16} />Copy</span>
      <span className="btn sec"><Icon name="regenerate" size={16} />Regenerate</span>
      <span className="btn gold"><Icon name="abbreviate" size={16} />Send to Abbreviation</span>
      <span className="btn maroon"><Icon name="delete" size={16} />Clear all</span>
      <span className="btn sec"><Icon name="check" size={16} />Copied</span>
    </div>

    <div className="nav">
      <div className="it on"><Icon name="home" size={18} />Home</div>
      <div className="it"><Icon name="abbreviate" size={18} />Abbreviate</div>
      <div className="it"><Icon name="ai" size={18} />AI Assistant</div>
      <div className="it"><Icon name="history" size={18} />History</div>
      <div className="it"><Icon name="validate" size={18} />Validate Usage</div>
      <div className="it"><Icon name="coverage" size={18} />Coverage Report</div>
    </div>
  </>
);

const written = await shoot([
  {
    name: "icons-sheet",
    html: renderToStaticMarkup(sheet),
    viewport: { width: 1000, height: 900 },
    css,
    fullPage: true,
  },
]);
console.log("wrote", written.join("\n"));
console.log("icons:", ALL_ICON_NAMES.length);
