/**
 * JSSDM data-audit / coverage report: a corpus-wide, computed-at-call-time
 * summary of the loaded dataset — never a static/hand-written count, so it
 * stays correct if the underlying manual extraction is ever re-run. This is
 * the "how much of the manual is covered, and where are the remaining rough
 * edges" view requested alongside the Personnel/pers architectural fix.
 */
import type { Entry } from "./types.ts";
import { ENTRIES, normFullKey } from "./database.ts";

export interface ReverseCollisionGroup {
  full: string;
  candidates: Array<{ abbr: string; overload: number | undefined; preferred: boolean; tied: boolean }>;
  resolution: "resolved" | "tied";
}

export interface FullFormCollision {
  full: string;
  candidates: Array<{ abbr: string; service: string }>;
  /** true when every candidate is distinguishable by service (force) — already
   *  correctly handled by resolveForceEntries and not a bug. */
  forceDifferentiated: boolean;
  /** true when every candidate is an Annex B reverse-ambiguity entry — already
   *  correctly handled by resolveReverseAmbiguity (the Personnel/pers fix)
   *  and not a bug. */
  reverseAmbiguityHandled: boolean;
}

export interface CoverageReport {
  totalEntries: number;
  byNotation: Record<string, number>;
  byCategory: Record<string, number>;
  byService: Record<string, number>;
  multiMeaningEntries: number;
  reverseAmbiguousEntries: number;
  reverseCollisionGroups: ReverseCollisionGroup[];
  fullFormCollisions: FullFormCollision[];
  unresolvedFullFormCollisions: FullFormCollision[];
}

const DERIVED_NOTATIONS = new Set(["variation", "shared-prefix", "positional", "alt-abbr"]);

export function buildCoverageReport(): CoverageReport {
  const byNotation: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byService: Record<string, number> = {};
  ENTRIES.forEach((e) => {
    byNotation[e.notation] = (byNotation[e.notation] || 0) + 1;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    const svc = e.service || "General";
    byService[svc] = (byService[svc] || 0) + 1;
  });

  const multiMeaningEntries = ENTRIES.filter((e) => e.multiMeaning).length;
  const reverseAmbiguousEntries = ENTRIES.filter((e) => e.reverseAmbiguous).length;

  /* Reverse-mapping (Annex B) collision groups — the class of issue behind
     the Personnel/pers bug — recomputed live from the entries' own
     precomputed flags, grouped by full-form text. */
  const byFullReverse = new Map<string, Entry[]>();
  ENTRIES.filter((e) => e.reverseAmbiguous).forEach((e) => {
    const k = normFullKey(e.full);
    if (!byFullReverse.has(k)) byFullReverse.set(k, []);
    byFullReverse.get(k)!.push(e);
  });
  const reverseCollisionGroups: ReverseCollisionGroup[] = [];
  byFullReverse.forEach((list) => {
    const tied = list.every((e) => e.reverseTied);
    reverseCollisionGroups.push({
      full: list[0].full,
      candidates: list.map((e) => ({ abbr: e.abbr, overload: e.reverseOverload, preferred: !!e.reversePreferred, tied: !!e.reverseTied })),
      resolution: tied ? "tied" : "resolved",
    });
  });
  reverseCollisionGroups.sort((a, b) => a.full.localeCompare(b.full));

  /* Whole-corpus full-form collision scan (excludes notation-expanded
     derived forms, which are expected to share a base full-form) — surfaces
     both the reverse-ambiguity cases above AND any full-form that maps to
     2+ distinct abbreviations for any other reason (typically force
     differentiation, already handled correctly by resolveForceEntries; a
     same-force duplicate is the one shape worth flagging as unresolved). */
  const byFullAll = new Map<string, Entry[]>();
  ENTRIES.forEach((e) => {
    if (DERIVED_NOTATIONS.has(e.notation)) return;
    const k = normFullKey(e.full);
    if (!byFullAll.has(k)) byFullAll.set(k, []);
    byFullAll.get(k)!.push(e);
  });
  const fullFormCollisions: FullFormCollision[] = [];
  byFullAll.forEach((list) => {
    const abbrs = new Set(list.map((e) => e.abbr));
    if (abbrs.size > 1) {
      const services = list.map((e) => e.service);
      const forceDifferentiated = new Set(services).size === services.length;
      // A group is "force-differentiated" (safe) when no two candidates
      // share the same service value — resolveForceEntries's priority order
      // (exact force > general > other force) then always has exactly one
      // best answer once a force is selected (a lone blank/general entry
      // alongside distinct force-specific ones is fine: it rides along as
      // the fallback, never competes). Two candidates sharing a service —
      // most often two blanks (a true full-form collision, handled instead
      // by reverseAmbiguityHandled below) or two entries pinned to the same
      // force (a genuine duplicate, e.g. "Sepoy") — needs a human look.
      const reverseAmbiguityHandled = list.every((e) => e.reverseAmbiguous);
      fullFormCollisions.push({
        full: list[0].full,
        candidates: list.map((e) => ({ abbr: e.abbr, service: e.service })),
        forceDifferentiated,
        reverseAmbiguityHandled,
      });
    }
  });
  fullFormCollisions.sort((a, b) => a.full.localeCompare(b.full));
  const unresolvedFullFormCollisions = fullFormCollisions.filter((c) => !c.forceDifferentiated && !c.reverseAmbiguityHandled);

  return {
    totalEntries: ENTRIES.length,
    byNotation,
    byCategory,
    byService,
    multiMeaningEntries,
    reverseAmbiguousEntries,
    reverseCollisionGroups,
    fullFormCollisions,
    unresolvedFullFormCollisions,
  };
}
