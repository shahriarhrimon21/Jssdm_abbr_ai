/**
 * Ported 1:1 from /tmp/mil/shell_bottom.html's RuleEngine IIFE and
 * findRuleSupportedFull. A conceptually separate reasoning layer from the
 * abbreviation dictionary: Abbreviate/De-abbreviate/Search/Validate/Audit
 * all consult it, and every answer it returns traces to one of, in
 * priority order:
 *   1. an explicit JSSDM entry (Section 16)              — handled upstream,
 *      by the plain index lookups (lookupFullExact / lookupAbbrExact),
 *      before RuleEngine is ever consulted;
 *   2. a specific JSSDM rule (Section 2, Para 0241b(3) plurals / 0241b(4)
 *      verb derivatives)                                  — RuleEngine.plural*
 *      and RuleEngine.verbFormFromFull below;
 *   3. a context-specific JSSDM rule (force applicability, writing-type
 *      restriction, fixed capitalization by position)     — resolveForceEntries /
 *      findCaseMismatch elsewhere;
 *   4. a general JSSDM convention                          — same as (2), the
 *      "rule-supported" tier;
 *   5. linguistic inference — NEVER used on its own. Every RuleEngine
 *      function below is grounded in a specific manual rule id; if none of
 *      the rule-grounded checks matches, the function returns null and the
 *      caller reports "not verified" rather than guessing from generic
 *      English/military knowledge.
 */
import type { Entry, RuleMatch } from "./types.ts";
import { abbrIndexCS, fullIndex, normFullKey, normSpace } from "./database.ts";

const NOUN_ELIGIBLE_EXCLUDE: Record<string, 1> = { "Unit of Measurement": 1, "Signal Punctuation": 1 };
function isSingleWord(s: string): boolean {
  return !!s && !/\s/.test(normSpace(s));
}
function nounEligible(e: Entry): boolean {
  return !NOUN_ELIGIBLE_EXCLUDE[e.category];
}

function englishPluralOf(word: string): string {
  if (/[^aeiouAEIOU]y$/.test(word)) return word.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + "es";
  return word + "s";
}
function englishSingularCandidates(word: string): string[] {
  const out: string[] = [];
  if (/ies$/i.test(word)) out.push(word.slice(0, -3) + "y");
  if (/(ses|xes|zes|ches|shes)$/i.test(word)) out.push(word.slice(0, -2));
  if (/s$/i.test(word) && !/ss$/i.test(word)) out.push(word.slice(0, -1));
  return out;
}

/* ---- Plurals: Section 2, Para 0241b(3) ----------------------------------
   "Where 's' is needed it is placed at the end of the abbreviation (e.g.
   GOCs) and only applies to noun abbreviations." Type A (an explicit
   separate singular/plural entry) and Type B (one abbreviation already
   grouped/shared across both, e.g. rat = Ration/Rations) are both resolved
   by the ordinary exact-match indices before this is ever reached — these
   two functions are the Type C ("rule-supported", grounded in 0241b(3)
   alone) fallback. Anything they don't cover is Type D — the caller
   reports "no authoritative plural abbreviation found", never guesses. */
function pluralFromFull(word: string): RuleMatch | null {
  const cands = englishSingularCandidates(normSpace(word));
  for (let i = 0; i < cands.length; i++) {
    const base = cands[i];
    const hits = (fullIndex.get(normFullKey(base)) || []).filter(
      (e) => nounEligible(e) && isSingleWord(e.full) && e.notation !== "literal",
    );
    if (hits.length) {
      return {
        plural: "C",
        base,
        entries: hits,
        abbr: hits[0].abbr + "s",
        rule: "r0241b3",
        reason:
          '"' + base + '" is explicitly listed ("' + hits[0].abbr + '"); Section 2, Para 0241b(3) permits adding \'s\' to the end of a noun abbreviation for the plural — no separate plural entry is listed, so this is rule-supported, not explicit.',
      };
    }
  }
  return null;
}
function pluralFromAbbr(token: string): RuleMatch | null {
  if (!/s$/i.test(token) || /ss$/i.test(token) || token.length < 3) return null;
  const baseAbbr = token.slice(0, -1);
  const hits = (abbrIndexCS.get(baseAbbr) || []).filter(
    (e) => nounEligible(e) && isSingleWord(e.full) && e.notation !== "literal",
  );
  if (!hits.length) return null;
  return {
    plural: "C",
    baseAbbr,
    entries: hits,
    full: englishPluralOf(hits[0].full),
    rule: "r0241b3",
    reason:
      '"' + baseAbbr + '" is explicitly listed ("' + hits[0].full + '"); Section 2, Para 0241b(3) permits adding \'s\' to the end of a noun abbreviation for the plural — no separate plural entry is listed, so this is rule-supported, not explicit.',
  };
}

/* ---- Verb derivatives: Section 2, Para 0241b(4) --------------------------
   "If there is an authorized abbreviation for a particular verb ... in
   present indefinite form, the same should be used for abbreviating all
   derivatives and tenses of that verb." A base entry only qualifies as the
   "present indefinite form" if its own full form is not itself already a
   specific tense/derivative (that would make IT the kind of one-off
   exception the rule carves out, e.g. bldg/retd/addl) — approximated here
   by excluding bases that already end in -ing/-ed. */
interface VerbSuffixRule {
  suf: string;
  strip: number;
  alt: (s: string) => string[];
}
const VERB_SUFFIXES: VerbSuffixRule[] = [
  { suf: "ing", strip: 3, alt: (s) => [s, s + "e"] },
  { suf: "ed", strip: 2, alt: (s) => [s, s + "e", s.slice(0, -1)] },
  { suf: "es", strip: 2, alt: (s) => [s] },
  { suf: "s", strip: 1, alt: (s) => [s] },
  { suf: "d", strip: 1, alt: (s) => [s] },
  { suf: "er", strip: 2, alt: (s) => [s, s + "e"] },
  { suf: "ive", strip: 3, alt: (s) => [s, s + "e"] },
];
function looksLikePresentIndefinite(full: string): boolean {
  return isSingleWord(full) && !/ing$/i.test(full) && !/ed$/i.test(full);
}
function verbFormFromFull(word: string): RuleMatch | null {
  const wl = normSpace(word).toLowerCase();
  for (let i = 0; i < VERB_SUFFIXES.length; i++) {
    const rule = VERB_SUFFIXES[i];
    if (wl.length <= rule.strip || !new RegExp(rule.suf + "$", "i").test(wl)) continue;
    const stems = rule.alt(wl.slice(0, wl.length - rule.strip));
    for (let j = 0; j < stems.length; j++) {
      if (!stems[j] || stems[j].length < 2) continue;
      const hits = (fullIndex.get(normFullKey(stems[j])) || []).filter(
        (e) => e.category === "General" && looksLikePresentIndefinite(e.full) && e.notation !== "literal",
      );
      if (hits.length) {
        return {
          entries: hits,
          abbr: hits[0].abbr,
          rule: "r0241b4",
          base: stems[j],
          viaSuffix: rule.suf,
          reason:
            '"' + stems[j] + '" is listed as the present-indefinite form ("' + hits[0].abbr + '"); Section 2, Para 0241b(4) extends an authorized verb abbreviation to all derivatives and tenses of that verb unless that specific derivative has its own separately listed exception (e.g. bldg, retd, addl).',
        };
      }
    }
  }
  return null;
}

export const RuleEngine = {
  pluralFromFull,
  pluralFromAbbr,
  verbFormFromFull,
  englishPluralOf,
};

/** Rule-supported inference used by Search's "not separately listed" suggestion
 *  panel: tries the plural engine first, then the verb-form engine, over a
 *  single-word query. Returns entries in the same {entry, appliedTo, viaSuffix,
 *  rule} shape Search already renders. */
export interface RuleSupportedHit {
  entry: Entry;
  appliedTo: string;
  viaSuffix: string;
  rule: string;
  reason: string;
}
export function findRuleSupportedFull(query: string): RuleSupportedHit[] {
  const q = normSpace(query);
  if (!q || /\s/.test(q)) return [];
  if (fullIndex.has(normFullKey(q))) return [];
  const out: RuleSupportedHit[] = [];
  const pl = pluralFromFull(q);
  if (pl) {
    pl.entries.forEach((e) => {
      out.push({ entry: e, appliedTo: q, viaSuffix: "plural, rule 0241b(3)", rule: pl.rule, reason: pl.reason });
    });
  }
  const vf = verbFormFromFull(q);
  if (vf) {
    vf.entries.forEach((e) => {
      out.push({
        entry: e,
        appliedTo: q,
        viaSuffix: "verb form (-" + vf.viaSuffix + "), rule 0241b(4)",
        rule: vf.rule,
        reason: vf.reason,
      });
    });
  }
  return out;
}
