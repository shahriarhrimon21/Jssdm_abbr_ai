export type ViewId =
  | "dashboard"
  | "abbreviate"
  | "deabbreviate"
  | "ai"
  | "search"
  | "validate"
  | "audit"
  | "consistency"
  | "favorites"
  | "rules"
  | "coverage";

export interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Convert",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "::" },
      { id: "abbreviate", label: "Abbreviate Text", icon: ">>" },
      { id: "deabbreviate", label: "De-abbreviate Text", icon: "<<" },
      { id: "ai", label: "AI Writing Assistant", icon: "ai" },
    ],
  },
  { label: "Look Up", items: [{ id: "search", label: "Search / Reverse Lookup", icon: "?" }] },
  {
    label: "Check",
    items: [
      { id: "validate", label: "Validate Usage", icon: "chk" },
      { id: "audit", label: "Audit Document", icon: "aud" },
      { id: "consistency", label: "Consistency Check", icon: "=?=" },
    ],
  },
  { label: "Saved", items: [{ id: "favorites", label: "Favorites & Recent", icon: "*" }] },
  {
    label: "Reference",
    items: [
      { id: "rules", label: "Manual Rules", icon: "§" },
      { id: "coverage", label: "JSSDM Coverage Report", icon: "cov" },
    ],
  },
];

export const NAV_LABELS: Record<ViewId, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.id, i.label]),
) as Record<ViewId, string>;
