/**
 * Ported 1:1 from /tmp/mil/shell_bottom.html's checkConsistency.
 * Flags: same canonical concept expressed as 2+ distinct surface forms
 * (either different abbreviations for one meaning, or full-form used in
 * one place and abbreviation elsewhere) within the same document.
 */
import type { Entry } from "./types.ts";
import { scanWindows } from "./parser.ts";
import { lookupFullExact, maxFullWords, normFullKey } from "./database.ts";
import { scanAbbrMatches } from "./deabbreviationEngine.ts";

export interface ConsistencyForm {
  surface: string;
  kind: "abbr" | "full";
  count: number;
  entry: Entry;
}
export interface ConsistencyIssue {
  concept: string;
  forms: ConsistencyForm[];
}

export function checkConsistency(text: string, force: string | null | undefined): ConsistencyIssue[] {
  const scan0 = scanAbbrMatches(text, force);
  const tokens = scan0.tokens;
  const abbrMatches = scan0.matches;
  const fullMatches = scanWindows(text, tokens, maxFullWords, (phrase) => lookupFullExact(phrase));

  /* group by canonical full-form key of the single highest-confidence entry */
  const byCanon = new Map<string, { full: string; forms: Map<string, ConsistencyForm> }>();
  function record(surface: string, entry: Entry, kind: "abbr" | "full") {
    const canon = normFullKey(entry.full);
    if (!byCanon.has(canon)) byCanon.set(canon, { full: entry.full, forms: new Map() });
    const g = byCanon.get(canon)!;
    const formKey = kind + ":" + surface;
    if (!g.forms.has(formKey)) g.forms.set(formKey, { surface, kind, count: 0, entry });
    g.forms.get(formKey)!.count++;
  }
  abbrMatches.forEach((m) => record(m.text, m.entries[0], "abbr"));
  fullMatches.forEach((m) => record(m.text, m.entries[0], "full"));

  const issues: ConsistencyIssue[] = [];
  byCanon.forEach((g) => {
    const forms = Array.from(g.forms.values());
    if (forms.length > 1) {
      issues.push({ concept: g.full, forms });
    }
  });
  issues.sort((a, b) => a.concept.localeCompare(b.concept));
  return issues;
}
