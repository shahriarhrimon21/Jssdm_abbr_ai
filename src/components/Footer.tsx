/**
 * Sitewide credit footer.
 *
 * Rendered once, under every page — unlike the sidebar's own citation
 * block (`.side-foot`, in Sidebar.tsx) which disappears on mobile along
 * with the rest of the sidebar, and unlike Home's `.footer-note`, which
 * explains the verified/AI split and belongs to Home specifically. This
 * component carries only attribution: who built it, and — since the
 * sidebar citation is not always on screen — a compact echo of the
 * manual it is built from.
 *
 * Lives in normal document flow (not fixed/sticky) inside `.shell-content`,
 * below `<main>`, so it scrolls with the page and never covers content on
 * a short viewport.
 */
export default function Footer() {
  return (
    <footer className="site-footer">
      <span>Developed By: BA-11571 Capt Md Shahriar Hossain, Sigs</span>
      <span>JSSDM 2022 · Service Writing</span>
    </footer>
  );
}
