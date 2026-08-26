/**
 * Ported 1:1 from /tmp/mil/shell_bottom.html lines ~5-177 (the working,
 * already-fixed vanilla-JS engine). Builds the in-memory indices once at
 * module load and exposes the same lookup primitives the rest of the
 * engine (abbreviationEngine, deabbreviationEngine, search, validation)
 * consume. No logic changed in this port — only typed and split into ES
 * modules.
 */
import type { Dataset, Entry, Rule } from "./types.ts";
import rawData from "./data/dataset.json" with { type: "json" };

const DATA = rawData as unknown as Dataset;

export const ENTRIES: Entry[] = DATA.entries;
export const RULES: Rule[] = DATA.rules;
export const RULEBYID: Record<string, Rule> = {};
RULES.forEach((r) => {
  RULEBYID[r.id] = r;
});

export function normSpace(s: string | null | undefined): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}
export function normFullKey(s: string): string {
  return normSpace(s).toLowerCase().replace(/[.,]/g, "");
}
export function stripDiacritics(s: string | null | undefined): string {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* Leading English articles ("The Commanding Officer", "The GOC" style address
   forms) are stripped before indexing for matching — they are a stylistic
   prefix in the manual's forms-of-address list, not part of the term, and left
   in would make free-text scanning swallow an ordinary "the"/"a"/"an" from
   surrounding prose into the match. */
export function stripLeadingArticle(s: string): string {
  return normSpace(s.replace(/^(the|an|a)\s+/i, ""));
}

/**
 * BUG FIX (JSSDM engine audit): `full` is only safe to split on "/" into
 * independent full-form variants when each side of the "/" is genuinely a
 * complete, interchangeable synonym for the SAME single abbreviation — e.g.
 * "Unserviceable/Unserviceability" -> "U/S" (both sides really do mean
 * "U/S" on their own), or the (s)-grouped plural notation handled below.
 *
 * It is NOT safe when the entry's own `abbr` also contains "/" in a way
 * that shows the full-form text is a compacted PORTMANTEAU of two (or more)
 * genuinely DIFFERENT abbreviations sharing overlapping words to save
 * space — e.g. "Unarmed/Unmanned Aerial System/Vehicle" -> "UAS/UAV" is
 * really "Unarmed Aerial System" (UAS) + "Unmanned Aerial Vehicle" (UAV)
 * elided together; naively splitting on every "/" produces nonsense
 * fragments ("Unmanned Aerial System" is not a real term) and, critically,
 * a bare last-word fragment ("Vehicle") that collided with and silently
 * outranked the real, distinct "Vehicle" -> "veh" entry — the confirmed
 * root cause of "vehicle" abbreviating to "UAS/UAV" instead of "veh".
 * Same failure shape for "Short/Vertical Take-off and Landing" -> "S/VTOL",
 * "Vertical/Short Take-off and Landing" -> "V/STOL", and
 * "Very/Very Very Important Person" -> "VIP/VVIP" (the bare word "Very" is
 * ordinary English and must never become an abbreviation trigger).
 *
 * `abbrHasSlash` lets the caller (database.ts's index-build loop, which
 * knows the entry's `abbr`) opt an entry out of "/" decomposition without
 * this function needing the full Entry type — it still always splits on
 * ";" (a different, unambiguous multi-meaning-list notation, e.g. "ACP").
 */
export interface FullVariant {
  text: string;
  /** BUG FIX (JSSDM engine audit): true for a variant that is the entry's
   *  own literal text (or an unambiguous ";"-separated meaning listed
   *  alongside it, or the manual's own explicit "(s)" plural notation) —
   *  false for a variant only reachable by STRIPPING a parenthetical
   *  qualifier out of the full text (e.g. "Frigate (Guided)" -> "Frigate").
   *  That stripped form is a strictly less-specific reading and must never
   *  outrank a DIFFERENT entry whose own literal full text is exactly that
   *  plain form — confirmed bug: "frigate" (no qualifier) was resolving to
   *  "FF(G)" (id 687, "Frigate (Guided)") instead of the correct "FF" (id
   *  1851, plain "Frigate"), because paren-stripped 687 happened to sort
   *  before 1851 in the dataset. The index-build loop below uses this flag
   *  to always place `exact:true` matches ahead of `exact:false` ones for
   *  the same key, regardless of dataset order — Priority 1 ("exact JSSDM
   *  database match") must never lose to a derived/stripped reading. */
  exact: boolean;
}

export function fullVariants(full: string, abbrHasSlash?: boolean): FullVariant[] {
  const exactSet = new Set<string>();
  const derivedSet = new Set<string>();
  const base = normSpace(full);
  const noParen = normSpace(base.replace(/\([^)]*\)/g, " "));
  const splitRe = abbrHasSlash ? /[;]/ : /[/;]/;

  const exactRaw = [base];
  base.split(splitRe).forEach((p) => {
    p = normSpace(p);
    if (p) exactRaw.push(p);
  });
  exactRaw.forEach((v) => {
    const stripped = stripLeadingArticle(v);
    if (stripped) exactSet.add(stripped);
  });

  if (noParen && noParen !== base) {
    const derivedRaw = [noParen];
    noParen.split(splitRe).forEach((p) => {
      p = normSpace(p);
      if (p) derivedRaw.push(p);
    });
    derivedRaw.forEach((v) => {
      const stripped = stripLeadingArticle(v);
      if (stripped && !exactSet.has(stripped)) derivedSet.add(stripped);
    });
  }

  /* Type B grouped plural notation embedded inline, e.g. "Article(s) in use",
     "Line(s) of Communication" - the manual's own "(s)" marker for "one
     abbreviation serves both the singular and plural form" (Section 2, Para
     0241b(3)). Index both readings so a query in either form finds the entry -
     this is Type B (explicitly grouped in the manual text, not a stripped
     qualifier), so both readings count as exact. */
  if (/\(s\)/i.test(base)) {
    const withS = stripLeadingArticle(normSpace(base.replace(/\(s\)/gi, "s")));
    const withoutS = stripLeadingArticle(normSpace(base.replace(/\(s\)/gi, "")));
    if (withS) exactSet.add(withS);
    if (withoutS) exactSet.add(withoutS);
  }

  const out: FullVariant[] = [];
  exactSet.forEach((text) => out.push({ text, exact: true }));
  derivedSet.forEach((text) => out.push({ text, exact: false }));
  return out;
}

export const abbrIndexCS = new Map<string, Entry[]>();
export const abbrIndexCI = new Map<string, Entry[]>();
export const fullIndex = new Map<string, Entry[]>();
export let maxAbbrWords = 1;
export let maxFullWords = 1;
/** Per fullIndex key, the ids of entries that reached it via an exact
 *  (non-derived) variant — see the priority-sort pass below. */
const exactIdsByKey = new Map<string, Set<number>>();

ENTRIES.forEach((e) => {
  const aw = e.abbr.split(/\s+/).length;
  if (aw > maxAbbrWords) maxAbbrWords = aw;
  if (!abbrIndexCS.has(e.abbr)) abbrIndexCS.set(e.abbr, []);
  abbrIndexCS.get(e.abbr)!.push(e);
  const ciKey = e.abbr.toLowerCase();
  if (!abbrIndexCI.has(ciKey)) abbrIndexCI.set(ciKey, []);
  abbrIndexCI.get(ciKey)!.push(e);

  fullVariants(e.full, e.abbr.includes("/")).forEach((v) => {
    const fw = v.text.split(/\s+/).length;
    if (fw > maxFullWords) maxFullWords = fw;
    const k = normFullKey(v.text);
    if (!fullIndex.has(k)) fullIndex.set(k, []);
    const arr = fullIndex.get(k)!;
    if (arr.indexOf(e) === -1) arr.push(e);
    if (v.exact) {
      if (!exactIdsByKey.has(k)) exactIdsByKey.set(k, new Set());
      exactIdsByKey.get(k)!.add(e.id);
    }
  });
});
maxAbbrWords = Math.min(maxAbbrWords, 4);
maxFullWords = Math.min(maxFullWords, 7);

/* Priority 1 ("exact JSSDM database match") must never lose to a
 * paren-stripped derived reading of a DIFFERENT entry — see FullVariant's
 * `exact` flag above. Stable-sort each key's candidate list so every entry
 * that reached this key via its own literal text comes before any entry
 * that only reached it via a stripped qualifier, regardless of dataset id
 * order (this is what fixes "frigate" resolving to the wrong "FF(G)"). */
exactIdsByKey.forEach((exactIds, key) => {
  const arr = fullIndex.get(key);
  if (!arr || arr.length < 2) return;
  const allExact = arr.every((e) => exactIds.has(e.id));
  if (allExact) return; // nothing to reorder — every candidate here is a genuine, equally-ranked match
  fullIndex.set(
    key,
    arr.slice().sort((a, b) => Number(exactIds.has(b.id)) - Number(exactIds.has(a.id))),
  );
});

/**
 * BUG FIX (JSSDM engine audit, same defect class as the "/" fullVariants
 * fix above, but found in the *static dataset* rather than at runtime):
 * some "variation"-notation entries were pre-generated by naively splitting
 * a combined manual listing like "Battalion/Battery Quarter Master
 * Sergeant" -> "BQMS" on its FIRST "/" into two entries, "Battalion" and
 * "Battery Quarter Master Sergeant" — dropping the shared suffix "Quarter
 * Master Sergeant" from the first fragment instead of recombining it
 * ("Battalion Quarter Master Sergeant"). The bare leftover word
 * ("Battalion") then wrongly became a standalone forward-lookup match for
 * "BQMS" — the exact same failure shape confirmed for "Vehicle" (see
 * fullVariants above), just baked into the dataset instead of produced at
 * index-build time. Confirmed instances found this way: "Sector" -> SHQ
 * (missing "Headquarters"), "Bring" -> BF (missing "Forward"), "Certificate"
 * -> CIV and -> CRV (both missing their voucher-type suffix — "Certificate"
 * alone already correctly means "cert" via a separate, genuine entry),
 * "Hull" -> H, and "Battalion" -> BQMS / -> BSM.
 *
 * This is detected generically (not a hardcoded id list) so it also catches
 * any future occurrence of the same pattern: within each group of entries
 * that share the same originalEntry.full + notation, an entry whose own
 * `full` is exactly the text before the FIRST "/" of that shared source
 * (i.e., a naive, un-recombined fragment) is excluded from forward
 * (full-text -> abbreviation) matching whenever a sibling in the same group
 * has a full form with MORE words — proof the fragment was missing a
 * shared suffix a smarter split would have kept. Per the "when in doubt,
 * preserve original" and "exact JSSDM mapping only" principles, these are
 * removed from fullIndex only (never confidently guessed at a corrected
 * form, which cannot be verified here against the primary manual text) —
 * they remain fully intact in ENTRIES/abbrIndex for reverse lookup,
 * de-abbreviation, search and coverage, since those are informational
 * rather than substituted into a user's operational message.
 */
function normWords(s: string): string {
  return normSpace(s).toLowerCase();
}
const suspectFragmentIds = new Set<number>();
{
  const groups = new Map<string, Entry[]>();
  ENTRIES.forEach((e) => {
    const oe = e.originalEntry;
    if (!oe || typeof oe.full !== "string" || oe.full.indexOf("/") === -1) return;
    const key = oe.full + " " + e.notation;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });
  groups.forEach((members, key) => {
    if (members.length < 2) return;
    const originalFull = key.slice(0, key.lastIndexOf(" "));
    const firstSeg = normWords(originalFull.split("/")[0]);
    members.forEach((m) => {
      if (normWords(m.full) !== firstSeg) return;
      const hasLongerSibling = members.some((sib) => sib !== m && sib.full.split(/\s+/).length > m.full.split(/\s+/).length);
      if (hasLongerSibling) suspectFragmentIds.add(m.id);
    });
  });
}
if (suspectFragmentIds.size) {
  fullIndex.forEach((arr, key) => {
    const filtered = arr.filter((e) => !suspectFragmentIds.has(e.id));
    if (filtered.length !== arr.length) {
      if (filtered.length) fullIndex.set(key, filtered);
      else fullIndex.delete(key);
    }
  });
}

export function lookupAbbrExact(token: string): Entry[] | null {
  if (abbrIndexCS.has(token)) return abbrIndexCS.get(token)!.slice();
  return null;
}
export function lookupAbbrCI(token: string): Entry[] | null {
  const k = token.toLowerCase();
  if (abbrIndexCI.has(k)) return abbrIndexCI.get(k)!.slice();
  return null;
}
export function lookupFullExact(phrase: string): Entry[] | null {
  const k = normFullKey(phrase);
  if (fullIndex.has(k)) return fullIndex.get(k)!.slice();
  return null;
}

export function catList(): string[] {
  const s = new Set<string>();
  ENTRIES.forEach((e) => s.add(e.category));
  return Array.from(s).sort();
}
export function svcList(): string[] {
  const s = new Set<string>();
  ENTRIES.forEach((e) => {
    if (e.service) s.add(e.service);
  });
  return Array.from(s).sort();
}

export interface Filter {
  service?: string;
  category?: string;
}

export function passFilter(e: Entry, filt: Filter | null | undefined): boolean {
  if (!filt) return true;
  if (filt.service && filt.service !== "all") {
    if (filt.service === "General") {
      if (e.service) return false;
    } else if (e.service !== filt.service) return false;
  }
  if (filt.category && filt.category !== "all" && e.category !== filt.category) return false;
  return true;
}

const SEC_NAME: Record<string, string> = {
  "16A": "Sec 16 Annex A",
  "16B": "Sec 16 Annex B",
  "16C": "Sec 16 Annex C",
  "16D": "Sec 16 Annex D",
  "16E": "Sec 16 Annex E",
  "16F": "Sec 16 Annex F",
  "16G": "Sec 16 Annex G",
  "16H": "Sec 16 Annex H",
  "3A": "Sec 3 Annex A",
  "15": "Sec 15",
  "2E": "Sec 2 Annex E",
};
export function fmtSource(e: Entry): string {
  return (SEC_NAME[e.section] || e.section) + ", p." + e.page;
}
