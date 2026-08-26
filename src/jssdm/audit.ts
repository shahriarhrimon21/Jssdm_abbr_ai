/** Ported 1:1 from /tmp/mil/shell_bottom.html's runAudit. */
import type { Entry } from "./types.ts";
import { fmtSource } from "./database.ts";
import { findCaseMismatch, looksLikeAbbr } from "./parser.ts";
import type { CaseMismatch } from "./parser.ts";
import { scanAbbrMatches } from "./deabbreviationEngine.ts";
import { checkConsistency } from "./consistency.ts";
import type { ConsistencyIssue } from "./consistency.ts";

export interface AuditRow {
  n: number;
  abbr: string;
  entries: Entry[];
  status: "ok" | "context" | "unverified";
  source: string;
  note?: string | null;
  forceStatus?: string;
  caseMismatch?: CaseMismatch | null;
}

export interface AuditResult {
  rows: AuditRow[];
  counts: { ok: number; context: number; unverified: number };
  total: number;
  consistency: ConsistencyIssue[];
}

export function runAudit(text: string, force: string | null | undefined): AuditResult {
  const scan2 = scanAbbrMatches(text, force);
  const tokens = scan2.tokens;
  const abbrMatches = scan2.matches;
  const rows: AuditRow[] = [];
  const counts = { ok: 0, context: 0, unverified: 0 };
  abbrMatches.forEach((m, idx) => {
    const status: AuditRow["status"] = m.forceStatus === "wrong-force" ? "context" : m.entries.length > 1 ? "context" : "ok";
    counts[status]++;
    rows.push({ n: idx + 1, abbr: m.text, entries: m.entries, status, source: fmtSource(m.entries[0]), note: m.note, forceStatus: m.forceStatus });
  });
  const consumed = new Set<number>();
  abbrMatches.forEach((m) => {
    for (let p = m.start; p < m.end; p++) consumed.add(p);
  });
  const unresolved = tokens.filter((t) => !consumed.has(t.start) && looksLikeAbbr(t.text));
  unresolved.forEach((t) => {
    const cm = findCaseMismatch(t.text, text, t.start);
    counts.unverified++;
    rows.push({ n: rows.length + 1, abbr: t.text, entries: [], status: "unverified", source: "—", caseMismatch: cm });
  });
  const consistency = checkConsistency(text, force);
  return { rows, counts, total: rows.length, consistency };
}
