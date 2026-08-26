/**
 * Screenshot harness (not part of the shipped app).
 *
 * `npm install` + `vite build` cannot run in the authoring sandbox, so this
 * is how the redesign is actually *looked at* rather than assumed correct:
 * it server-renders real components through react-dom/server, wraps the
 * markup in a document carrying the real stylesheet, loads it in headless
 * Chromium at a given viewport and theme, and writes a PNG.
 *
 * Usage:  node --experimental-strip-types scripts/shoot.mjs <target> [...]
 * Targets are registered in scripts/shots.tsx.
 */
import playwright from "/home/claude/.npm-global/lib/node_modules/playwright/index.js";
const { chromium } = playwright;
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".shots");
mkdirSync(OUT, { recursive: true });

/** Viewport presets used for every review pass. */
export const VIEWPORTS = {
  "desktop-1920": { width: 1920, height: 1080 },
  "desktop-1440": { width: 1440, height: 900 },
  "desktop-1366": { width: 1366, height: 768 },
  "tablet-port": { width: 834, height: 1112, isMobile: true, hasTouch: true },
  "tablet-land": { width: 1112, height: 834, isMobile: true, hasTouch: true },
  "phone-port": { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  "phone-land": { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  "phone-small": { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

/**
 * The captured page is served via setContent, so there is no origin for a
 * root-relative asset path to resolve against and every <img src="/…">
 * would render as a broken box. Inlining the referenced files from
 * public/ as data URIs is what lets the shots show the real logo instead
 * of a placeholder — the app itself is untouched and still ships ordinary
 * asset paths.
 */
function inlineAssets(html) {
  return html.replace(/src="\/([^"]+\.(svg|png))"/g, (whole, rel, ext) => {
    try {
      const buf = readFileSync(resolve(ROOT, "public", rel));
      const mime = ext === "svg" ? "image/svg+xml" : "image/png";
      return `src="data:${mime};base64,${buf.toString("base64")}"`;
    } catch {
      return whole;
    }
  });
}

function page(html, { theme, css, bare }) {
  const stylesheet = css ?? readFileSync(resolve(ROOT, "src/styles/app.css"), "utf8");
  html = inlineAssets(html);
  return `<!doctype html><html lang="en"${theme ? ` data-theme="${theme}"` : ""}><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Condensed:wght@500;600;700&display=swap" rel="stylesheet">
<style>${stylesheet}</style>${bare ? "<style>body{padding:24px}</style>" : ""}
</head><body><div id="root">${html}</div></body></html>`;
}

/**
 * @param shots Array of { name, html, viewport, theme, css, bare, fullPage, clip }
 */
export async function shoot(shots) {
  const browser = await chromium.launch();
  const written = [];
  for (const s of shots) {
    const vp = typeof s.viewport === "string" ? VIEWPORTS[s.viewport] : s.viewport;
    if (!vp) throw new Error("unknown viewport: " + s.viewport);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor ?? 1,
      isMobile: !!vp.isMobile,
      hasTouch: !!vp.hasTouch,
      colorScheme: s.theme === "dark" ? "dark" : "light",
    });
    const p = await ctx.newPage();
    await p.setContent(page(s.html, s), { waitUntil: "networkidle" });
    // Webfonts must be resolved before capture or the shot measures the
    // fallback metrics and every spacing judgement made from it is wrong.
    await p.evaluate(() => document.fonts.ready);
    const file = resolve(OUT, `${s.name}.png`);
    await p.screenshot({ path: file, fullPage: !!s.fullPage, clip: s.clip });
    written.push(file);
    await ctx.close();
  }
  await browser.close();
  return written;
}

export { page as buildPage, OUT };
