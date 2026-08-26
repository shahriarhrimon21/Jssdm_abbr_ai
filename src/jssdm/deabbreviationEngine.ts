/**
 * Ported 1:1 from /tmp/mil/shell_bottom.html — abbreviation-token ->
 * full-form direction, used directly by De-abbreviate and as the shared
 * scan pass behind Validate / Audit / Consistency.
 *
 * Abbreviation lookup used when scanning free-running text (de-abbreviate, validate,
 * audit, consistency). Case-sensitive only, per manual rule 0241b(8) — case is fixed
 * exactly as shown in Section 16 regardless of position, so a capitalized form that
 * does not exactly match a stored entry is NEVER silently accepted here — it is left
 * unmatched and picked up as a flagged case mismatch instead. This also avoids
 * matching ordinary English words that happen to coincide with a lower-case unit
 * abbreviation. A single-word token that fails exact lookup but looks like a
 * rule-supported plural (Section 2, Para 0241b(3) — e.g. "tps" for "tp"+s) is
 * resolved via RuleEngine rather than left unmatched, and is tagged so the caller
 * can label it "rule-supported" rather than "explicit". Units of Measurement
 * entries (e.g. "in", "m", "l", "t", "g") are only accepted immediately after a
 * numeral, since that is the only context the manual authorizes their use in —
 * otherwise "in", "at" etc. would misfire constantly on prose.
 */
import type { Entry, RuleMatch, Span, Token } from "./types.ts";
import { findWordTokens, scanWindows, looksLikeAbbr, findCaseMismatch, fuzzyAbbrMatches } from "./parser.ts";
import type { FuzzyMatch } from "./parser.ts";
import { lookupAbbrExact, maxAbbrWords, fmtSource } from "./database.ts";
import { RuleEngine } from "./ruleEngine.ts";
import { resolveForceEntries } from "./forceResolution.ts";
import { RULEBYID } from "./database.ts";

interface MatchEntries extends Array<Entry> {
  _note?: string | null;
  _forceStatus?: string;
  _ruleInfo?: RuleMatch | null;
}

export function guardedAbbrLookup(
  phrase: string,
  w: number,
  i: number,
  tokens: Token[],
  text: string,
  force: string | null | undefined,
): MatchEntries | null {
  let entries: Entry[] | null = lookupAbbrExact(phrase);
  let ruleInfo: RuleMatch | null = null;
  if (!entries && w === 1) {
    const pl = RuleEngine.pluralFromAbbr(phrase);
    if (pl) {
      entries = pl.entries;
      ruleInfo = pl;
    }
  }
  if (!entries) return null;
  const allUnits = entries.every((e) => e.category === "Unit of Measurement");
  if (allUnits) {
    const prev = tokens[i - 1];
    if (!prev || !/^\d+([.,]\d+)?$/.test(prev.text)) return null;
  }
  const resolved = resolveForceEntries(entries, force);
  const out = resolved.picked.slice() as MatchEntries;
  out._note = ruleInfo ? "rule-plural" : null;
  out._forceStatus = resolved.status;
  out._ruleInfo = ruleInfo;
  return out;
}

export interface AbbrScanMatch {
  start: number;
  end: number;
  text: string;
  entries: Entry[];
  note?: string | null;
  forceStatus?: string;
  ruleInfo?: RuleMatch | null;
}

export interface AbbrScan {
  tokens: Token[];
  matches: AbbrScanMatch[];
}

export function scanAbbrMatches(text: string, force: string | null | undefined): AbbrScan {
  const tokens = findWordTokens(text);
  const matches = scanWindows<MatchEntries>(text, tokens, maxAbbrWords, (phrase, w, i) =>
    guardedAbbrLookup(phrase, w, i, tokens, text, force),
  ) as unknown as AbbrScanMatch[];
  matches.forEach((m) => {
    const me = m.entries as unknown as MatchEntries;
    m.note = me._note;
    m.forceStatus = me._forceStatus;
    m.ruleInfo = me._ruleInfo;
  });
  return { tokens, matches };
}

export interface DeabbreviateRow {
  original: string;
  full: string;
  status: "ok" | "warn" | "context" | "rule";
  entries: Entry[];
  source: string;
  note?: string | null;
  forceStatus?: string;
  ruleInfo?: RuleMatch | null;
}

export interface FlaggedToken {
  token: string;
  caseMismatch?: ReturnType<typeof findCaseMismatch>;
  suggestions?: FuzzyMatch[];
}

export interface DeabbreviateResult {
  output: string;
  rows: DeabbreviateRow[];
  flagged: FlaggedToken[];
  outSpans: Span[];
}

/* Decision order per token: (1) preserve the entered capitalization as read
   — it is never silently "corrected" in the rewritten output, only checked
   and flagged separately below; (2) determine force; (3) exact case-sensitive
   JSSDM entry; (4) rule-authorized plural (Section 2, Para 0241b(3)) if no
   exact entry exists; (5) resolve multiple candidates by listing every
   authorized meaning rather than guessing one; (6) anything left over is
   picked up in the unresolved-token pass below and checked for a case-only
   mismatch before being reported as unverified. */
export function runDeabbreviate(text: string, force: string | null | undefined): DeabbreviateResult {
  const scan = scanAbbrMatches(text, force);
  const tokens = scan.tokens;
  const matches = scan.matches;
  const rows: DeabbreviateRow[] = [];
  const outParts: string[] = [];
  const outSpans: Span[] = [];
  let cursor = 0;
  let outLen = 0;
  const flagged: FlaggedToken[] = [];

  matches.forEach((m) => {
    const pre = text.slice(cursor, m.start);
    outParts.push(pre);
    outLen += pre.length;
    const chosen = m.entries[0];
    const ruleInfo = m.ruleInfo ?? null;
    const status: DeabbreviateRow["status"] = ruleInfo
      ? "rule"
      : m.forceStatus === "wrong-force"
        ? "warn"
        : m.entries.length > 1
          ? "context"
          : "ok";
    const fullStr = ruleInfo ? ruleInfo.full! : chosen.full;
    const cls: Span["cls"] = status === "ok" ? "hl-verified" : "hl-context";
    outSpans.push({
      start: outLen,
      end: outLen + fullStr.length,
      cls,
      title: ruleInfo ? RULEBYID[ruleInfo.rule].code + " (rule-supported)" : fmtSource(chosen),
    });
    outParts.push(fullStr);
    outLen += fullStr.length;
    rows.push({
      original: m.text,
      full: fullStr,
      status,
      entries: m.entries,
      source: ruleInfo
        ? RULEBYID[ruleInfo.rule].code + ' — derived from "' + chosen.abbr + '" (' + fmtSource(chosen) + ")"
        : fmtSource(chosen),
      note: m.note,
      forceStatus: m.forceStatus,
      ruleInfo,
    });
    cursor = m.end;
  });
  outParts.push(text.slice(cursor));

  /* second pass over unmatched all-caps-ish tokens not consumed by matches, to flag unresolved */
  const consumed = new Set<number>();
  matches.forEach((m) => {
    for (let p = m.start; p < m.end; p++) consumed.add(p);
  });
  tokens.forEach((t) => {
    if (consumed.has(t.start)) return;
    if (looksLikeAbbr(t.text)) {
      const caseMismatch = findCaseMismatch(t.text, text, t.start);
      if (caseMismatch) {
        flagged.push({ token: t.text, caseMismatch });
      } else {
        const fz = fuzzyAbbrMatches(t.text, 1);
        flagged.push({ token: t.text, suggestions: fz });
      }
    }
  });
  return { output: outParts.join(""), rows, flagged, outSpans };
}
