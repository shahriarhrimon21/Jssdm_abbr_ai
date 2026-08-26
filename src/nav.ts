import type { IconName } from "./components/Icon.tsx";

export type ViewId =
  | "dashboard"
  | "abbreviate"
  | "ai"
  | "messageHistory"
  | "deabbreviate"
  | "validate"
  | "audit"
  | "consistency"
  | "search"
  | "favorites"
  | "rules"
  | "coverage";

export interface NavItem {
  id: ViewId;
  label: string;
  icon: IconName;
  /** The label used where horizontal space is tight (mobile bottom bar). */
  shortLabel?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Information architecture (Phase 2 §4).
 *
 * Grouped rather than flat: the daily path sits at the top unadorned, and
 * everything else is present but subordinate. The draft brief's menu
 * covered five of these twelve features — grouping is what let all twelve
 * survive the redesign without burying the workflow that most visits are
 * actually for.
 *
 * "Saved & Recent" is deliberately filed under Reference, not Workflow:
 * it holds starred dictionary entries and recent lookups, NOT saved
 * message outputs. Those live in History. Conflating the two is the
 * single easiest way for a user to lose work they thought they had saved.
 */
export const NAV: NavGroup[] = [
  {
    label: "Workflow",
    items: [
      { id: "dashboard", label: "Home", icon: "home" },
      { id: "abbreviate", label: "Abbreviate", icon: "abbreviate" },
      { id: "ai", label: "AI Assistant", icon: "ai", shortLabel: "AI" },
      { id: "messageHistory", label: "History", icon: "history" },
    ],
  },
  {
    label: "Tools",
    items: [
      { id: "deabbreviate", label: "De-abbreviate", icon: "deabbreviate" },
      { id: "validate", label: "Validate Usage", icon: "validate" },
      { id: "audit", label: "Audit Document", icon: "audit" },
      { id: "consistency", label: "Consistency Check", icon: "consistency" },
    ],
  },
  {
    label: "Reference",
    items: [
      { id: "search", label: "Search & Lookup", icon: "search" },
      { id: "favorites", label: "Saved & Recent", icon: "saved" },
      { id: "rules", label: "Manual Rules", icon: "rules" },
      { id: "coverage", label: "Coverage Report", icon: "coverage" },
    ],
  },
];

export const NAV_LABELS: Record<ViewId, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.id, i.label]),
) as Record<ViewId, string>;

export const NAV_ICONS: Record<ViewId, IconName> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.id, i.icon]),
) as Record<ViewId, IconName>;

/** The four Workflow destinations carried by the mobile bottom bar.
 *  Everything else is reachable there through the "More" sheet. */
export const PRIMARY_NAV: NavItem[] = NAV[0].items;
