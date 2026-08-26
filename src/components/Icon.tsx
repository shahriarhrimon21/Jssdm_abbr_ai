import type { ReactNode } from "react";

/**
 * The application's single icon source (Phase 2).
 *
 * Every icon is hand-authored SVG on the same geometry Lucide uses — a
 * 24×24 viewBox, 2px stroke, round caps and joins, no fills — so the set
 * reads as one family rather than a pile of borrowed marks. Nothing is
 * imported: there is no icon package dependency, so the set adds no
 * install step, cannot drift with a package version, and is guaranteed
 * present offline like every other interface asset (see the offline rule
 * in the Phase 2 brief — no interface asset may depend on the network).
 *
 * Colour comes from `currentColor` in every path, which is what lets a
 * single icon inherit the theme, the hover state, and the verified/AI
 * accent of whatever it sits inside without a per-theme variant.
 *
 * Naming follows Lucide's own vocabulary deliberately: migrating to
 * `lucide-react` later is an install plus an import swap, not a redesign.
 *
 * Accessibility: an icon is decorative by default (aria-hidden) because it
 * almost always sits beside a text label. Passing `title` promotes it to
 * an img-role element with an accessible name — used only where an icon
 * genuinely stands alone.
 */

export type IconName =
  // navigation — workflow
  | "home"
  | "abbreviate"
  | "ai"
  | "history"
  // navigation — tools
  | "deabbreviate"
  | "validate"
  | "audit"
  | "consistency"
  // navigation — reference
  | "search"
  | "saved"
  | "rules"
  | "coverage"
  // navigation — system
  | "settings"
  | "help"
  // actions
  | "copy"
  | "check"
  | "edit"
  | "save"
  | "delete"
  | "send"
  | "clear"
  | "refresh"
  | "regenerate"
  | "plus"
  | "stop"
  // disclosure & movement
  | "expand"
  | "collapse"
  | "chevron-right"
  | "chevron-left"
  | "more"
  | "menu"
  | "close"
  | "back"
  | "forward"
  | "sidebar"
  // status
  | "info"
  | "success"
  | "warning"
  | "error"
  | "loading"
  | "verified"
  | "unverified"
  // system state
  | "online"
  | "offline"
  | "theme-light"
  | "theme-dark"
  | "keyboard"
  | "eye";

/* Path data only — the shared <svg> wrapper below supplies viewBox, stroke
   width, caps and joins, so no individual icon repeats them. */
const PATHS: Record<IconName, ReactNode> = {
  /* ---- navigation: workflow ---- */
  home: (
    <>
      <path d="M3 9.5 12 2l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M9 22v-8h6v8" />
    </>
  ),
  // Compress: chevrons driven inward toward a centre rule — text being
  // shortened. Deliberately the exact silhouette-inverse of `deabbreviate`
  // rather than a mirrored arrow, because mirrored arrows are
  // indistinguishable at 16px and these two sit next to each other in the
  // sidebar.
  abbreviate: (
    <>
      <path d="M12 4v16" />
      <path d="m4 8 3.5 4L4 16" />
      <path d="m20 8-3.5 4 3.5 4" />
    </>
  ),
  // Sparkles — the established convention for machine-generated content, and
  // legible at 16px where a circuit-brain silhouette is not.
  ai: (
    <>
      <path d="M12 2.5 13.9 8 19.5 10 13.9 12 12 17.5 10.1 12 4.5 10 10.1 8Z" />
      <path d="M18.5 15.5 19.3 18l2.2.8-2.2.9-.8 2.3-.8-2.3-2.2-.9 2.2-.8Z" />
      <path d="M5 3.5 5.6 5.3 7.5 6l-1.9.7L5 8.5l-.6-1.8L2.5 6l1.9-.7Z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),

  /* ---- navigation: tools ---- */
  // Expand: chevrons driven outward from a centre rule — the short form
  // opening back out to full text.
  deabbreviate: (
    <>
      <path d="M12 4v16" />
      <path d="M8.5 8 5 12l3.5 4" />
      <path d="m15.5 8 3.5 4-3.5 4" />
    </>
  ),
  validate: (
    <>
      <path d="M20 12.5c0 4.8-3.4 7.2-7.6 8.6a1 1 0 0 1-.8 0C7.4 19.7 4 17.3 4 12.5V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.3-2.7a1.1 1.1 0 0 1 1.4 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  audit: (
    <>
      <path d="M3 5h4M3 12h4M3 19h4" />
      <path d="m10.5 4 1.5 1.5L15 2.5" />
      <path d="M11 12h10M11 19h10" />
    </>
  ),
  // "Not equal" — two rules struck through. The check flags the same
  // concept written two different ways, so a mismatch mark says what it
  // does far better than the exchange arrows it replaced.
  consistency: (
    <>
      <path d="M5 9h14M5 15h14" />
      <path d="M17 4 7 20" />
    </>
  ),

  /* ---- navigation: reference ---- */
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  saved: <path d="m12 3 2.9 5.9 6.1.9-4.5 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.8l6.1-.9Z" />,
  rules: (
    <>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z" />
    </>
  ),
  coverage: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),

  /* ---- navigation: system ---- */
  settings: (
    <>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.9-2.8 2.9" />
      <path d="M12 17.5h.01" />
    </>
  ),

  /* ---- actions ---- */
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  check: <path d="m20 6-11 11-5-5" />,
  edit: (
    <>
      <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" />
      <path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L12.5 14 9 15l1-3.5Z" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h7" />
    </>
  ),
  delete: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  send: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </>
  ),
  clear: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  regenerate: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M12 9v6M9 12h6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,

  /* ---- disclosure & movement ---- */
  expand: <path d="m6 9 6 6 6-6" />,
  collapse: <path d="m18 15-6-6-6 6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  "chevron-left": <path d="m15 18-6-6 6-6" />,
  more: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  back: (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  forward: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </>
  ),

  /* ---- status ---- */
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.4 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.4a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
  loading: (
    <>
      <path d="M12 3v4" />
      <path d="m18.4 5.6-2.9 2.9" />
      <path d="M21 12h-4" />
      <path d="m18.4 18.4-2.9-2.9" />
      <path d="M12 21v-4" />
      <path d="m5.6 18.4 2.9-2.9" />
      <path d="M3 12h4" />
      <path d="m5.6 5.6 2.9 2.9" />
    </>
  ),
  // Seal + tick: "traceable to the manual". Deliberately distinct in
  // silhouette from `success`, since the two carry different meanings.
  verified: (
    <>
      <path d="M12 2.5 14.6 5l3.5-.4 1 3.4 3 1.9-1.7 3.1 1.7 3.1-3 1.9-1 3.4-3.5-.4L12 21.5 9.4 19l-3.5.4-1-3.4-3-1.9L4.6 11 2.9 7.9l3-1.9 1-3.4L10.4 3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  unverified: (
    <>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </>
  ),

  /* ---- system state ---- */
  online: (
    <>
      <path d="M2.5 9a15 15 0 0 1 19 0" />
      <path d="M6 12.5a10 10 0 0 1 12 0" />
      <path d="M9.5 16a5 5 0 0 1 5 0" />
      <path d="M12 20h.01" />
    </>
  ),
  offline: (
    <>
      <path d="M2.5 9a15 15 0 0 1 5-3.3" />
      <path d="M11 5.1a15 15 0 0 1 10.5 3.9" />
      <path d="M6 12.5a10 10 0 0 1 3-2" />
      <path d="M15 11a10 10 0 0 1 3 1.5" />
      <path d="M12 20h.01" />
      <path d="m2 2 20 20" />
    </>
  ),
  "theme-light": (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  "theme-dark": <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  keyboard: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01" />
      <path d="M10 13h4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  /** Rendered square size in px. 16 / 20 / 24 are the verified sizes. */
  size?: number;
  className?: string;
  /** Supplying a title makes the icon meaningful to assistive tech.
   *  Omit it whenever a visible text label already names the control. */
  title?: string;
  strokeWidth?: number;
}

export default function Icon({ name, size = 20, className, title, strokeWidth = 2 }: IconProps) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      className={"icon" + (className ? " " + className : "")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {paths}
    </svg>
  );
}

/** Every icon name, for the verification harness. */
export const ALL_ICON_NAMES = Object.keys(PATHS) as IconName[];
