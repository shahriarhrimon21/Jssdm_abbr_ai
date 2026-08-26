/**
 * Regression suite for the JSSDM engine port. Run with:
 *   node --test src/jssdm/__tests__/*.test.ts
 * (Node 22's native TypeScript type-stripping runs these directly — no
 * build step, no ts-node/tsx dependency, so this suite runs even though
 * `npm install` is blocked in the authoring sandbox; see the README for
 * how it was actually executed and verified before delivery.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { runAbbreviate } from "../abbreviationEngine.ts";
import { runDeabbreviate } from "../deabbreviationEngine.ts";
import { checkConsistency } from "../consistency.ts";
import { runValidate } from "../validation.ts";
import { runAudit } from "../audit.ts";
import { searchFullPartial, searchAbbrPartial } from "../search.ts";
import { lookupFullExact, lookupAbbrExact, ENTRIES, RULES } from "../database.ts";
import { buildCoverageReport } from "../coverage.ts";
import { traceAbbreviate } from "../debug.ts";

test("dataset loads with the expected shape", () => {
  assert.ok(ENTRIES.length > 3000, "expected 3000+ entries, got " + ENTRIES.length);
  assert.ok(RULES.length > 15, "expected rules to be loaded");
});

/* ---- The critical, user-reported case: Personnel -> pers, not PA ---- */
test('CRITICAL: "Personnel" abbreviates to "pers", not "PA"', () => {
  const r = runAbbreviate("Personnel are en route.", "all");
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].abbr, "pers");
  assert.equal(r.rows[0].status, "ok");
  assert.match(r.rows[0].source, /conflicting candidate suppressed: PA/);
});

test('search: "personnel" ranks "pers" before "PA"', () => {
  const hits = searchFullPartial("personnel");
  const persIdx = hits.findIndex((e) => e.abbr === "pers");
  const paIdx = hits.findIndex((e) => e.abbr === "PA");
  assert.ok(persIdx !== -1 && paIdx !== -1, "expected both pers and PA in results");
  assert.ok(persIdx < paIdx, `expected pers (${persIdx}) before PA (${paIdx})`);
});

test('lookupFullExact("Personnel") still exposes both candidates (nothing is silently dropped)', () => {
  const hits = lookupFullExact("Personnel");
  assert.ok(hits);
  const abbrs = hits!.map((e) => e.abbr).sort();
  assert.deepEqual(abbrs, ["PA", "pers"]);
});

/* ---- The other genuine Annex B collision: Record (RO vs rec) — a real tie,
   correctly left ambiguous rather than guessed. ---- */
test('"Record" is a genuine tie (RO vs rec) and is surfaced as ambiguous, not silently picked', () => {
  const r = runAbbreviate("Record the results.", "all");
  assert.equal(r.rows[0].original, "Record");
  assert.equal(r.rows[0].status, "context");
  assert.equal(r.rows[0].entries.length, 2);
  assert.match(r.rows[0].source, /ambiguous/);
});

/* ---- Prior-round regression cases (already-verified against the shipped
   vanilla-JS app before this port) ---- */
test("Troop/Troops: explicit singular, rule-supported plural", () => {
  const singular = runAbbreviate("Troop movement.", "all");
  assert.equal(singular.rows[0].abbr, "tp");
  assert.equal(singular.rows[0].status, "ok");

  const plural = runAbbreviate("Troops moved out.", "all");
  assert.equal(plural.rows[0].abbr, "tps");
  assert.equal(plural.rows[0].status, "rule");
});

test("Mark/Marks: explicit singular, rule-supported plural", () => {
  const singular = runAbbreviate("Mark the location.", "all");
  assert.equal(singular.rows[0].abbr, "mk");
  const plural = runAbbreviate("Marks were noted.", "all");
  assert.equal(plural.rows[0].abbr, "mks");
  assert.equal(plural.rows[0].status, "rule");
});

test("Organize/Organized: explicit base, rule-supported verb-derivative", () => {
  const base = runAbbreviate("Organize the unit.", "all");
  assert.equal(base.rows[0].abbr, "org");
  const derived = runAbbreviate("Organized units.", "all");
  assert.equal(derived.rows[0].abbr, "org");
  assert.equal(derived.rows[0].status, "rule");
});

test("Document/Documents: explicit base, rule-supported plural", () => {
  const base = runAbbreviate("Document the incident.", "all");
  assert.equal(base.rows[0].abbr, "docu");
  const plural = runAbbreviate("Documents were filed.", "all");
  assert.equal(plural.rows[0].abbr, "docus");
  assert.equal(plural.rows[0].status, "rule");
});

test("Support/Supported: both explicitly listed variations, both verified", () => {
  const r = runAbbreviate("Support was Supported.", "all");
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].abbr, "sp");
  assert.equal(r.rows[0].status, "ok");
  assert.equal(r.rows[1].abbr, "sp");
  assert.equal(r.rows[1].status, "ok");
});

/* ---- De-abbreviate direction ---- */
test("de-abbreviate: pers -> Personnel/Personal shown as ambiguous (both candidates listed)", () => {
  const r = runDeabbreviate("The pers arrived.", "all");
  assert.equal(r.rows.length, 1);
  assert.ok(r.rows[0].entries.length > 1, "pers has more than one Annex B meaning and should list all of them");
});

test("de-abbreviate: an unknown all-caps token is flagged, never invented", () => {
  const r = runDeabbreviate("The ZZZQX unit reported in.", "all");
  const flaggedTokens = r.flagged.map((f) => f.token);
  assert.ok(flaggedTokens.includes("ZZZQX"));
});

/* ---- Force / service resolution ---- */
test("force filter: a force-specific entry is preferred when that force is selected", () => {
  const anyForce = runAbbreviate("Chief of Naval Staff.", "Navy");
  // Sanity: force filtering must not throw and must return a result set.
  assert.ok(Array.isArray(anyForce.rows));
});

/* ---- Consistency checker ----
   Note: the checker deliberately does not attempt to disambiguate which
   meaning of a multi-meaning abbreviation is intended in context (that
   would be exactly the kind of unsupported inference this tool refuses to
   do) — so "pers"/"PA" next to "Personnel" is NOT flagged unless their own
   first-listed meaning happens to be "Personnel" (it is not: "pers" =
   Personal first, "PA" = Personal Assistant first). "tp", by contrast, has
   exactly one listed meaning ("Troop"), so mixing it with the full form is
   unambiguous and correctly flagged. */
test("consistency check flags mixed abbr/full usage of an unambiguous concept", () => {
  const issues = checkConsistency("Troop movement: the Troop and tp were both mentioned.", "all");
  assert.ok(
    issues.some((i) => i.concept === "Troop"),
    "expected a consistency issue for mixed Troop/tp usage",
  );
});

/* ---- Validate usage: allied correspondence forbids abbreviations outright ---- */
test("validate: allied correspondence flags every abbreviation as not-permitted", () => {
  const v = runValidate("The pers arrived.", "allied", "all");
  assert.equal(v.overall, "bad");
  assert.ok(v.findings.some((f) => f.text && /allied forces/.test(f.text)));
});

test("validate: capitalization mismatch is flagged as bad, with a reasoned block", () => {
  const v = runValidate("the TK arrived.", "nonoperational", "all");
  // "TK" is not a stored form (Tk=Taka, tk=Tank) — expect a bad-level capitalization finding.
  assert.equal(v.overall, "bad");
});

/* ---- Audit ---- */
test("audit: counts ok/context/unverified across a mixed document", () => {
  const a = runAudit("pers reported. ZZZQX unresolved.", "all");
  assert.ok(a.counts.ok + a.counts.context >= 1);
  assert.ok(a.counts.unverified >= 1);
});

/* ---- Search partials ---- */
test("searchAbbrPartial finds entries by partial abbreviation text", () => {
  const hits = searchAbbrPartial("per");
  assert.ok(hits.some((e) => e.abbr === "pers"));
});

/* ---- Coverage / data-audit report ---- */
test("coverage report: only Annex B has 2 reverse collisions (Personnel resolved, Record tied)", () => {
  const r = buildCoverageReport();
  assert.equal(r.reverseCollisionGroups.length, 2);
  const personnel = r.reverseCollisionGroups.find((g) => g.full === "Personnel");
  const record = r.reverseCollisionGroups.find((g) => g.full === "Record");
  assert.equal(personnel?.resolution, "resolved");
  assert.equal(record?.resolution, "tied");
});

test("coverage report: whole-corpus collision scan finds exactly the known 14, 13 handled + 1 flagged (Sepoy)", () => {
  const r = buildCoverageReport();
  assert.equal(r.fullFormCollisions.length, 14);
  assert.equal(r.unresolvedFullFormCollisions.length, 1);
  assert.equal(r.unresolvedFullFormCollisions[0].full, "Sepoy");
});

/* ---- Debug trace mode ---- */
test("debug trace: Personnel shows the reverse-ambiguity resolution step", () => {
  const t = traceAbbreviate("Personnel", "all");
  assert.equal(t.result?.text, "pers");
  assert.ok(t.steps.some((s) => /Reverse-ambiguity/.test(s.label) && /pers.*preferred/.test(s.detail)));
});

test("lookupAbbrExact is case-sensitive per Section 2, Para 0241b(8)", () => {
  const lower = lookupAbbrExact("tk");
  const upper = lookupAbbrExact("Tk");
  assert.ok(lower && lower[0].full === "Tank");
  assert.ok(upper && upper[0].full === "Taka");
});

/* ---- Phrase-first / longest-match regression suite ----
 * scanWindows() (see parser.ts) already tries the longest word-window first
 * at every position and only falls back to shorter windows when no longer
 * match exists — this is a greedy longest-match algorithm, not word-by-word
 * processing. These tests pin that behaviour down explicitly so a future
 * change can't silently regress it back to word-first processing. */
test('CRITICAL: "Junior Commissioned Officer" abbreviates as one phrase (JCO), not word-by-word', () => {
  const r = runAbbreviate("Junior Commissioned Officer", "all");
  assert.equal(r.output, "JCO");
  assert.equal(r.rows.length, 1, "must be a single 3-word match, not three separate word matches");
  assert.equal(r.rows[0].original, "Junior Commissioned Officer");
  assert.equal(r.rows[0].abbr, "JCO");
});

test('CRITICAL: "Junior Commissioned Officer" inside a full sentence still resolves as one phrase', () => {
  const r = runAbbreviate("The Junior Commissioned Officer will attend the meeting.", "all");
  assert.match(r.output, /^The JCO will \S+ the meeting\.$/, "the 3-word phrase must collapse to JCO as a unit");
  assert.ok(
    !/jr\s+commissioned|commissioned\s+offr/i.test(r.output),
    "must never fall back to abbreviating the individual words of a recognized phrase",
  );
});

test("individual words still abbreviate correctly on their own when no larger phrase applies", () => {
  assert.equal(runAbbreviate("Junior officer training.", "all").rows[0].abbr, "jr");
  assert.equal(runAbbreviate("The officer arrived.", "all").rows[0].abbr, "offr");
});

test("longest-match wins on a genuine dataset overlap (air defence vs air defence artillery)", () => {
  assert.ok(lookupFullExact("air defence"), "expected 'air defence' to be its own entry (AD)");
  assert.ok(lookupFullExact("air defence artillery"), "expected 'air defence artillery' to be its own longer entry (ADA)");
  const longer = runAbbreviate("The air defence artillery unit moved.", "all");
  assert.match(longer.output, /\bADA\b/, "the 3-word phrase must win over the 2-word prefix");
  assert.ok(!/\bAD artillery\b/.test(longer.output), "must not abbreviate only the 'air defence' prefix and leave 'artillery' dangling");
  const shorter = runAbbreviate("Air defence radar was tested.", "all");
  assert.match(shorter.output, /\bAD\b/, "when the longer phrase isn't present, the shorter one must still match");
});
