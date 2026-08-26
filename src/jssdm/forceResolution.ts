/**
 * Ported 1:1 from /tmp/mil/shell_bottom.html — this is the architectural
 * fix for the "Personnel -> PA instead of pers" bug (see the deep audit).
 * NOT a hard-coded exception: resolveReverseAmbiguity operates on the
 * reverseAmbiguous/reverseOverload/reversePreferred/reverseTied metadata
 * precomputed for every Section 16 Annex B collision, corpus-wide, by
 * build.py — it will apply to any future word with the same shape of
 * collision, not just "Personnel".
 */
import type { Entry, ForceResolution, ForceStatus, ReverseNote, ReverseResolution } from "./types.ts";
import { fmtSource } from "./database.ts";

/* Reverse-mapping ambiguity (Section 16 Annex B, "Abbreviations With Multiple
   Meaning"): that annex is built abbreviation -> [meanings] as a DE-abbreviation
   reference, not a forward full-form -> abbreviation table. Exploding every
   listed meaning into its own full-form entry (so a bare word like "Personnel"
   is findable at all in Abbreviate/Search) means that when the exact same
   meaning text is listed under two different abbreviations, neither is
   inherently "the" explicit answer — e.g. "Personnel" is listed as one of
   PA's 5 meanings AND one of pers's 2 meanings (verified directly against the
   manual, Section 16 Annex B, page 16B-5). Picking whichever happened to load
   first (id order) is a silent, arbitrary guess — the root cause of
   "Personnel" resolving to "PA" instead of "pers".
   Every such collision across the whole Annex B corpus (found mechanically at
   build time, not by hand for this one word — see build.py) is precomputed
   onto the affected entries as reverseAmbiguous/reverseOverload/reversePreferred:
   reverseOverload is how many total meanings that entry's abbreviation carries,
   and reversePreferred marks the single least-overloaded (most specific)
   candidate, when there is one. This function applies that: a lone preferred
   candidate wins outright and the rest are kept only as a disclosed suppressed
   alternative (never silently dropped); a genuine tie — e.g. "Record": RO and
   rec both have exactly 2 meanings each — is left unresolved so every
   candidate is surfaced instead of guessed. Entries from any other source
   (Annex A/C/G/H etc, never reverseAmbiguous) are untouched by this function -
   it only ever acts within an all-Annex-B collision group. */
export function resolveReverseAmbiguity(entries: Entry[] | null | undefined): ReverseResolution {
  if (!entries || entries.length < 2) return { picked: entries as Entry[], note: null };
  if (!entries.every((e) => e.reverseAmbiguous)) return { picked: entries, note: null };
  const preferred = entries.filter((e) => e.reversePreferred);
  if (preferred.length === 1) {
    const winner = preferred[0];
    const suppressed = entries.filter((e) => e !== winner);
    const note: ReverseNote = {
      winner: winner.abbr,
      suppressed: suppressed.map((e) => ({ abbr: e.abbr, overload: e.reverseOverload })),
      reason:
        '"' + winner.abbr + '" has fewer total listed meanings (' + winner.reverseOverload + ") than " +
        suppressed.map((e) => '"' + e.abbr + '" (' + e.reverseOverload + ")").join(", ") +
        ' — both list "' + winner.full + '" as one of their meanings in Section 16 Annex B (' + fmtSource(winner) + "), so the less-overloaded, more specific abbreviation is used.",
    };
    return { picked: [winner].concat(suppressed), note };
  }
  return {
    picked: entries,
    note: {
      tied: true,
      reason:
        'Section 16 Annex B lists "' + entries[0].full + '" as a meaning of ' +
        entries.map((e) => '"' + e.abbr + '"').join(" and ") +
        " with no basis to prefer one over the other — shown as multiple candidates rather than guessed.",
    },
  };
}

/** Force/service applicability (sections 9-11): reorder candidates so entries that
 *  apply to the selected force come first, without discarding cross-force homonyms -
 *  they stay visible as other candidates, per "clearly identify the applicable force". */
export function resolveForceEntries(entries: Entry[] | null | undefined, force: string | null | undefined): ForceResolution {
  if (!entries || !entries.length) return { picked: entries as Entry[], status: "none" as ForceStatus };
  if (!force || force === "all") return { picked: entries, status: entries.length > 1 ? "context" : "ok" };
  /* Exact force-specific matches outrank general/joint entries, which in turn
     outrank entries specific to a different force - "prioritize the selected
     force" (section 11), not merely "don't drop the others". */
  const exact = entries.filter((e) => e.service === force);
  const general = entries.filter((e) => !e.service);
  const otherForce = entries.filter((e) => e.service && e.service !== force);
  const applicable = exact.concat(general);
  if (applicable.length === 0) return { picked: entries, status: "wrong-force" };
  const picked = applicable.concat(otherForce);
  const status: ForceStatus = applicable.length === 1 ? "ok" : "context";
  return { picked, status };
}
