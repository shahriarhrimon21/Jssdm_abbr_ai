/**
 * Debug/trace mode: a step-by-step, auditable record of how a single
 * word or phrase was resolved, so a user can see exactly which JSSDM
 * mechanism produced (or failed to produce) a result — never a black box.
 *
 * This module doesn't change resolution behavior; it re-runs the same
 * lookup steps abbreviationEngine/deabbreviationEngine use and narrates
 * each one. Example trace for "Personnel" (the reported bug case):
 *
 *   1. exact-match lookup (Section 16, forward index) -> 2 candidates:
 *        PA  (Sec 16 Annex B, p.16B-5, 5 total listed meanings)
 *        pers (Sec 16 Annex B, p.16B-5, 2 total listed meanings)
 *   2. reverse-ambiguity check -> both candidates are Annex B
 *      "multiple meaning" entries -> resolved: "pers" preferred
 *      (fewer total meanings: 2 vs 5); "PA" kept as disclosed alternative.
 *   3. force filter (force = all) -> no narrowing applied.
 *   4. RESULT: "pers"  (status: ok; alternative suppressed: PA)
 */
import type { Entry, Force } from "./types.ts";
import { lookupFullExact, lookupAbbrExact, fmtSource } from "./database.ts";
import { RuleEngine } from "./ruleEngine.ts";
import { resolveReverseAmbiguity, resolveForceEntries } from "./forceResolution.ts";

export interface DebugStep {
  step: number;
  label: string;
  detail: string;
}
export interface DebugTrace {
  input: string;
  direction: "abbreviate" | "deabbreviate";
  steps: DebugStep[];
  result: { text: string; status: string } | null;
}

export function traceAbbreviate(word: string, force?: Force | string): DebugTrace {
  const steps: DebugStep[] = [];
  let n = 1;
  let found: Entry[] | null = lookupFullExact(word);
  let ruleInfo = null as ReturnType<typeof RuleEngine.pluralFromFull> | null;
  if (found) {
    steps.push({
      step: n++,
      label: "Exact-match lookup (Section 16, forward index)",
      detail:
        found.length +
        " candidate(s) found: " +
        found.map((e) => e.abbr + " (" + fmtSource(e) + (e.reverseAmbiguous ? ", " + e.reverseOverload + " total listed meanings" : "") + ")").join("; "),
    });
  } else {
    steps.push({ step: n++, label: "Exact-match lookup (Section 16, forward index)", detail: "no exact entry found" });
    ruleInfo = RuleEngine.pluralFromFull(word) || RuleEngine.verbFormFromFull(word);
    if (ruleInfo) {
      found = ruleInfo.entries;
      steps.push({
        step: n++,
        label: "Rule-engine fallback (Section 2, Para 0241b(3)/(4))",
        detail: ruleInfo.reason,
      });
    } else {
      steps.push({ step: n++, label: "Rule-engine fallback", detail: "no plural/verb-derivative rule matched either — reporting unverified" });
    }
  }
  if (!found) {
    return { input: word, direction: "abbreviate", steps, result: null };
  }
  const revRes = resolveReverseAmbiguity(found);
  if (revRes.note) {
    steps.push({
      step: n++,
      label: "Reverse-ambiguity check (Section 16 Annex B collision)",
      detail: revRes.note.winner
        ? 'resolved: "' + revRes.note.winner + '" preferred — ' + revRes.note.reason
        : "genuine tie, no candidate suppressed — " + revRes.note.reason,
    });
  } else {
    steps.push({ step: n++, label: "Reverse-ambiguity check", detail: "not applicable (not an Annex B collision)" });
  }
  const forForce = revRes.note && revRes.note.winner ? [revRes.picked[0]] : revRes.picked;
  const resolved = resolveForceEntries(forForce, force as string | undefined);
  steps.push({
    step: n++,
    label: "Force filter (force = " + (force || "all") + ")",
    detail:
      resolved.status === "ok" || resolved.status === "context"
        ? "kept " + resolved.picked.length + " candidate(s), status: " + resolved.status
        : "no candidate applies to the selected force (status: " + resolved.status + ")",
  });
  const chosen = ruleInfo ? { abbr: ruleInfo.abbr! } : resolved.picked[0];
  return {
    input: word,
    direction: "abbreviate",
    steps,
    result: { text: chosen.abbr, status: ruleInfo ? "rule" : resolved.status },
  };
}

export function traceDeabbreviate(token: string, force?: Force | string): DebugTrace {
  const steps: DebugStep[] = [];
  let n = 1;
  const found = lookupAbbrExact(token);
  if (found) {
    steps.push({
      step: n++,
      label: "Exact case-sensitive lookup (Section 16, Para 0241b(8))",
      detail: found.length + " meaning(s) found: " + found.map((e) => e.full + " (" + fmtSource(e) + ")").join("; "),
    });
  } else {
    steps.push({ step: n++, label: "Exact case-sensitive lookup", detail: "no case-exact entry — case-insensitive form may still exist but is reported as a capitalization issue, not silently accepted" });
    return { input: token, direction: "deabbreviate", steps, result: null };
  }
  const resolved = resolveForceEntries(found, force as string | undefined);
  steps.push({
    step: n++,
    label: "Force filter (force = " + (force || "all") + ")",
    detail: "status: " + resolved.status + ", " + resolved.picked.length + " candidate(s) retained",
  });
  const chosen = resolved.picked[0];
  return {
    input: token,
    direction: "deabbreviate",
    steps,
    result: { text: chosen.full, status: found.length > 1 ? "context" : resolved.status },
  };
}
