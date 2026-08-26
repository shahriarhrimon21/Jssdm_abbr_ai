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

export function fullVariants(full: string): string[] {
  const out = new Set<string>();
  const base = normSpace(full);
  const noParen = normSpace(base.replace(/\([^)]*\)/g, " "));
  const raw = [base];
  if (noParen) raw.push(noParen);
  base.split(/[/;]/).forEach((p) => {
    p = normSpace(p);
    if (p) raw.push(p);
  });
  noParen.split(/[/;]/).forEach((p) => {
    p = normSpace(p);
    if (p) raw.push(p);
  });
  raw.forEach((v) => {
    const stripped = stripLeadingArticle(v);
    if (stripped) out.add(stripped);
  });
  /* Type B grouped plural notation embedded inline, e.g. "Article(s) in use",
     "Line(s) of Communication" - the manual's own "(s)" marker for "one
     abbreviation serves both the singular and plural form" (Section 2, Para
     0241b(3)). Index both readings so a query in either form finds the entry -
     this is Type B (explicitly grouped in the manual text), not a guess. */
  if (/\(s\)/i.test(base)) {
    const withS = stripLeadingArticle(normSpace(base.replace(/\(s\)/gi, "s")));
    const withoutS = stripLeadingArticle(normSpace(base.replace(/\(s\)/gi, "")));
    if (withS) out.add(withS);
    if (withoutS) out.add(withoutS);
  }
  return Array.from(out);
}

export const abbrIndexCS = new Map<string, Entry[]>();
export const abbrIndexCI = new Map<string, Entry[]>();
export const fullIndex = new Map<string, Entry[]>();
export let maxAbbrWords = 1;
export let maxFullWords = 1;

ENTRIES.forEach((e) => {
  const aw = e.abbr.split(/\s+/).length;
  if (aw > maxAbbrWords) maxAbbrWords = aw;
  if (!abbrIndexCS.has(e.abbr)) abbrIndexCS.set(e.abbr, []);
  abbrIndexCS.get(e.abbr)!.push(e);
  const ciKey = e.abbr.toLowerCase();
  if (!abbrIndexCI.has(ciKey)) abbrIndexCI.set(ciKey, []);
  abbrIndexCI.get(ciKey)!.push(e);

  fullVariants(e.full).forEach((v) => {
    const fw = v.split(/\s+/).length;
    if (fw > maxFullWords) maxFullWords = fw;
    const k = normFullKey(v);
    if (!fullIndex.has(k)) fullIndex.set(k, []);
    const arr = fullIndex.get(k)!;
    if (arr.indexOf(e) === -1) arr.push(e);
  });
});
maxAbbrWords = Math.min(maxAbbrWords, 4);
maxFullWords = Math.min(maxFullWords, 7);

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
