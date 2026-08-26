/**
 * Ported 1:1 from /tmp/mil/shell_bottom.html's runAbbreviate — the
 * full-form-phrase -> abbreviation direction. Decision order per
 * word/phrase, matching the priority hierarchy documented across this
 * module set:
 *   (1) force filter narrows candidates, not applied until a match exists;
 *   (2) exact JSSDM entry (lookupFullExact — covers explicit entries AND the
 *       already-expanded word-form/grouped-notation forms);
 *   (3) rule-authorized grammatical form — Section 2, Para 0241b(3) plural or
 *       0241b(4) verb-derivative, single words only, via RuleEngine;
 *   (4) sentence position / capitalization is NOT re-derived here: the
 *       abbreviation is always emitted in the exact case Section 16 stores it
 *       in (Para 0241b(8)), regardless of where in the sentence it falls;
 *   (5) if nothing above matches, the phrase is left as plain text — never
 *       replaced with a guessed abbreviation.
 */
import type { Entry, ReverseNote, RuleMatch, Span } from "./types.ts";
import { findWordTokens, scanWindows } from "./parser.ts";
import { lookupFullExact, maxFullWords, fmtSource } from "./database.ts";
import { RuleEngine } from "./ruleEngine.ts";
import { resolveForceEntries, resolveReverseAmbiguity } from "./forceResolution.ts";
import { RULEBYID } from "./database.ts";

export interface AbbreviateRow {
  original: string;
  abbr: string;
  status: "ok" | "context" | "rule";
  entries: Entry[];
  source: string;
  forceStatus: string;
  ruleInfo: RuleMatch | null;
  reverseNote: ReverseNote | null;
}

export interface AbbreviateResult {
  output: string;
  rows: AbbreviateRow[];
  outSpans: Span[];
}

interface MatchEntries extends Array<Entry> {
  _forceStatus?: string;
  _ruleInfo?: RuleMatch | null;
  _reverseNote?: ReverseNote | null;
}

export function runAbbreviate(text: string, force: string | null | undefined): AbbreviateResult {
  const tokens = findWordTokens(text);
  const matches = scanWindows<MatchEntries>(text, tokens, maxFullWords, (phrase, w) => {
    let found: Entry[] | null = lookupFullExact(phrase);
    let ruleInfo: RuleMatch | null = null;
    if (!found && w === 1) {
      const rf = RuleEngine.pluralFromFull(phrase) || RuleEngine.verbFormFromFull(phrase);
      if (rf) {
        found = rf.entries;
        ruleInfo = rf;
      }
    }
    if (!found) return null;
    /* Reverse-ambiguity resolution runs BEFORE force resolution, and only ever
       narrows a same-force Annex B collision (see resolveReverseAmbiguity) - it
       never competes with or overrides genuine force-specific entries. When it
       resolves to a single winner, only that winner is handed to force
       resolution (so status naturally reads "ok", not a spurious "context"
       purely from the now-suppressed alternative's presence); a genuine tie
       passes every tied candidate through unchanged. */
    const revRes = resolveReverseAmbiguity(found);
    const forForce = revRes.note && revRes.note.winner ? [revRes.picked[0]] : revRes.picked;
    const resolved = resolveForceEntries(forForce, force);
    const out = resolved.picked.slice() as MatchEntries;
    out._forceStatus = resolved.status;
    out._ruleInfo = ruleInfo;
    out._reverseNote = revRes.note;
    return out;
  });

  const rows: AbbreviateRow[] = [];
  const outParts: string[] = [];
  const outSpans: Span[] = [];
  let cursor = 0;
  let outLen = 0;

  matches.forEach((m) => {
    const pre = text.slice(cursor, m.start);
    outParts.push(pre);
    outLen += pre.length;
    const chosen = m.entries[0];
    const forceStatus = m.entries._forceStatus!;
    const ruleInfo = m.entries._ruleInfo ?? null;
    const reverseNote = m.entries._reverseNote ?? null;
    const status: AbbreviateRow["status"] = ruleInfo
      ? "rule"
      : forceStatus === "wrong-force"
        ? "context"
        : (reverseNote && reverseNote.tied) || m.entries.length > 1
          ? "context"
          : "ok";
    const abbrStr = ruleInfo ? ruleInfo.abbr! : chosen.abbr;
    outSpans.push({
      start: outLen,
      end: outLen + abbrStr.length,
      cls: status === "ok" ? "hl-verified" : "hl-context",
      title: ruleInfo ? RULEBYID[ruleInfo.rule].code + " (rule-supported)" : fmtSource(chosen),
    });
    outParts.push(abbrStr);
    outLen += abbrStr.length;
    let srcText = ruleInfo
      ? RULEBYID[ruleInfo.rule].code + ' — derived from "' + chosen.full + '" (' + fmtSource(chosen) + ")"
      : fmtSource(chosen);
    if (reverseNote && reverseNote.winner) {
      srcText +=
        " · ⚠ conflicting candidate suppressed: " +
        (reverseNote.suppressed || []).map((s) => s.abbr + " (" + s.overload + " meanings)").join(", ") +
        " — " + reverseNote.reason;
    } else if (reverseNote && reverseNote.tied) {
      srcText += " · ⚠ ambiguous: " + reverseNote.reason;
    }
    rows.push({
      original: m.text,
      abbr: abbrStr,
      status,
      entries: m.entries,
      source: srcText,
      forceStatus,
      ruleInfo,
      reverseNote,
    });
    cursor = m.end;
  });
  outParts.push(text.slice(cursor));
  return { output: outParts.join(""), rows, outSpans };
}
