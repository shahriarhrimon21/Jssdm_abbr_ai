/**
 * Ported 1:1 from /tmp/mil/shell_bottom.html's searchAbbrPartial and
 * searchFullPartial, including the reverse-ambiguity sort tiebreak added
 * for the Personnel/pers fix (a non-ambiguous entry sentinel of -1 always
 * sorts before any reverseOverload value, and among ambiguous entries the
 * less-overloaded / more-specific one sorts first).
 */
import type { Entry } from "./types.ts";
import { ENTRIES, normSpace, passFilter } from "./database.ts";
import type { Filter } from "./database.ts";

export function searchAbbrPartial(q: string, filt?: Filter | null): Entry[] {
  q = normSpace(q).toLowerCase();
  if (!q) return [];
  const out: Entry[] = [];
  const seen = new Set<number>();
  ENTRIES.forEach((e) => {
    if (filt && !passFilter(e, filt)) return;
    if (e.abbr.toLowerCase().indexOf(q) !== -1) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    }
  });
  out.sort((a, b) => {
    const ea = a.abbr.toLowerCase() === q ? 0 : a.abbr.toLowerCase().indexOf(q) === 0 ? 1 : 2;
    const eb = b.abbr.toLowerCase() === q ? 0 : b.abbr.toLowerCase().indexOf(q) === 0 ? 1 : 2;
    return ea - eb || a.abbr.length - b.abbr.length;
  });
  return out;
}

export function searchFullPartial(q: string, filt?: Filter | null): Entry[] {
  q = normSpace(q).toLowerCase();
  if (!q) return [];
  const out: Entry[] = [];
  ENTRIES.forEach((e) => {
    if (filt && !passFilter(e, filt)) return;
    if (e.full.toLowerCase().indexOf(q) !== -1) out.push(e);
  });
  out.sort((a, b) => {
    const ea = a.full.toLowerCase().indexOf(q) === 0 ? 0 : 1;
    const eb = b.full.toLowerCase().indexOf(q) === 0 ? 0 : 1;
    if (ea !== eb) return ea - eb;
    if (a.full.length !== b.full.length) return a.full.length - b.full.length;
    /* Same relevance tier (e.g. both an exact-length match on the query) - if
       this is a Section 16 Annex B reverse-mapping collision (see
       resolveReverseAmbiguity in forceResolution.ts), surface the
       less-overloaded, more specific candidate first rather than leaving it
       to accidental id order. */
    const ao = a.reverseAmbiguous ? a.reverseOverload || 99 : -1;
    const bo = b.reverseAmbiguous ? b.reverseOverload || 99 : -1;
    return ao - bo;
  });
  return out;
}
