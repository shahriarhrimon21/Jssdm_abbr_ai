/**
 * Core data shapes for the JSSDM engine, ported 1:1 from the field names
 * baked into dataset.json by /tmp/mil/build.py + build3.py (the original
 * vanilla-JS build pipeline). Nothing here changes the data itself — this
 * is purely typing the same records the working app already used.
 */

export type Notation =
  | "explicit"
  | "literal"
  | "variation"
  | "shared-prefix"
  | "positional"
  | "alt-abbr"
  | string;

export interface Entry {
  id: number;
  full: string;
  abbr: string;
  category: string;
  /** Empty string ("") means "general / not force-specific", never null/undefined. */
  service: string;
  section: string;
  page: string;
  notation: Notation;

  /** True for every entry exploded out of Section 16 Annex B ("Abbreviations
   *  With Multiple Meaning") — a de-abbreviation reference, not a forward
   *  full-form table. See resolveReverseAmbiguity in forceResolution.ts. */
  multiMeaning?: boolean;
  /** True if this entry belongs to a genuine Annex B collision group (same
   *  full-form text listed under 2+ distinct abbreviations). */
  reverseAmbiguous?: boolean;
  /** How many total meanings this entry's abbreviation carries across all
   *  of Annex B — lower = more specific. */
  reverseOverload?: number;
  /** True for the single least-overloaded candidate in its collision group,
   *  when there is a unique one. */
  reversePreferred?: boolean;
  /** True for every entry in a collision group with no unique lowest-overload
   *  winner (a genuine tie, e.g. Record: RO vs rec). */
  reverseTied?: boolean;

  /** Present on "variation"/"positional"/"shared-prefix"-notation entries
   *  that were expanded from one combined manual listing (e.g. "Vehicle/
   *  Vehicular" -> two entries) — the source listing this entry was split
   *  from. Was mistyped as `string`; the dataset actually stores an object.
   *  Now read by database.ts's index-build audit (see the comment there) to
   *  detect and exclude a specific class of incomplete-split entries. */
  originalEntry?: { full: string; abbr: string };
  quantity?: string;
  symbol?: string;
  /** Present on every "Rank"-category entry (56/56, confirmed against the
   *  dataset) — which personnel category the rank belongs to: "Officer",
   *  "Other Ranks", "Sailor", or "Airmen". Was mistyped as `number`; the
   *  dataset actually stores one of these strings. No other category uses
   *  this field, which is what makes `category === "Rank"` (backed by a
   *  real tier) a reliable, generic signal for the same-force Rank-priority
   *  tie-break in database.ts (see the comment there — the "Sepoy"
   *  ambiguity fix). */
  tier?: string;
}

export interface Rule {
  id: string;
  code: string;
  source: string;
  title: string;
  text: string;
}

export interface Dataset {
  entries: Entry[];
  rules: Rule[];
}

/** A single word/phrase token found in free-running input text. */
export interface Token {
  text: string;
  start: number;
  end: number;
}

/** One highlighted span in a rewritten output string. */
export interface Span {
  start: number;
  end: number;
  cls: "hl-verified" | "hl-context" | "hl-unverified";
  title: string;
}

export type ForceStatus = "ok" | "context" | "wrong-force" | "none";

export interface ForceResolution {
  picked: Entry[];
  status: ForceStatus;
}

export interface ReverseNote {
  winner?: string;
  suppressed?: Array<{ abbr: string; overload: number | undefined }>;
  reason: string;
  tied?: boolean;
}

export interface ReverseResolution {
  picked: Entry[];
  note: ReverseNote | null;
}

/** A rule-derived match (plural / verb-derivative) — mirrors the shape
 *  RuleEngine.pluralFromFull / pluralFromAbbr / verbFormFromFull return. */
export interface RuleMatch {
  entries: Entry[];
  rule: string;
  reason: string;
  abbr?: string;
  full?: string;
  base?: string;
  baseAbbr?: string;
  viaSuffix?: string;
  plural?: string;
}

export type Force = "Army" | "Navy" | "Air Force" | "Joint" | "all";
