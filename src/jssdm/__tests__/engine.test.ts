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

/* ---- JSSDM engine audit fix: "Vehicle" -> "veh", not "UAS/UAV". Root
 * cause was a bad "/" split of a combined manual listing ("Unarmed/Unmanned
 * Aerial System/Vehicle" -> UAS/UAV) that produced a bare leftover fragment
 * "Vehicle" which silently outranked the real, distinct "Vehicle" -> "veh"
 * entry (see database.ts's fullVariants `exact` stable-sort). This was
 * previously verified only via a throwaway script, never as a permanent
 * regression test — added here per Phase 1.5 Part 5. */
test('CRITICAL: "Vehicle" abbreviates to "veh", not "UAS/UAV" (bad "/" split regression)', () => {
  assert.equal(runAbbreviate("Vehicle movement report.", "all").rows[0].abbr, "veh");
  assert.equal(runAbbreviate("The vehicle was inspected.", "all").rows[0].abbr, "veh", "case-insensitive");
  assert.equal(runAbbreviate("VEHICLE reported.", "all").rows[0].abbr, "veh", "all-caps input");
  assert.equal(runAbbreviate("Vehicles were inspected.", "all").rows[0].abbr, "vehs", "rule-derived plural");
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

/* ---- Composite nouns/verbs: Section 2, Para 0241b(1) — previously carried
 * in the rules dataset (RULEBYID.r0241b1) but never implemented in code.
 * "minefd" for "minefield" is the manual's OWN worked example for this
 * rule (not a value that should ever be hardcoded); these tests exercise
 * the GENERAL rule, not a "minefield" special case — the manual's other
 * worked example ("demob" for "demobilize") and the rule's own stated
 * exception ("C attk" for "counter attack") are covered too, so a future
 * change can't silently narrow this back down to one hardcoded word. */
test('CRITICAL: "minefield" abbreviates to "minefd" via Section 2, Para 0241b(1) — the manual\'s own worked example for this rule', () => {
  const r = runAbbreviate("The minefield was cleared.", "all");
  const row = r.rows.find((x) => x.original.toLowerCase() === "minefield")!;
  assert.ok(row, "expected \"minefield\" to be matched at all");
  assert.equal(row.abbr, "minefd");
  assert.equal(row.status, "rule", "rule-supported (0241b1), not an explicit Section 16 entry");
  assert.match(row.source, /0241b\(1\)/);
  assert.match(row.source, /Field/i, "the reason should trace back to the \"Field\" -> \"fd\" entry it was derived from");
});

test('"minefield" is case-insensitive and works capitalized/mid-sentence, same as any other rule-supported term', () => {
  assert.equal(runAbbreviate("Minefield ahead.", "all").rows[0].abbr, "minefd", "capitalized");
  assert.equal(runAbbreviate("MINEFIELD MARKED.", "all").rows[0].abbr, "minefd", "all-caps input");
  const midSentence = runAbbreviate("Move carefully around the minefield.", "all");
  const row = midSentence.rows.find((r) => r.original.toLowerCase() === "minefield")!;
  assert.ok(row, "mid-sentence");
  assert.equal(row.abbr, "minefd", "mid-sentence");
});

test('the manual\'s OTHER Para 0241b(1) worked example — "demob" for "demobilize" — also resolves correctly', () => {
  const r = runAbbreviate("Troops will demobilize tomorrow.", "all");
  const row = r.rows.find((x) => x.original.toLowerCase() === "demobilize")!;
  assert.ok(row);
  assert.equal(row.abbr, "demob");
  assert.equal(row.status, "rule");
  assert.match(row.source, /0241b\(1\)/);
});

test('Para 0241b(1)\'s own stated EXCEPTION — "counterattack" typed as one word resolves to "C attk" (the dedicated Counter Attack entry), not a naive "counterattk" concatenation', () => {
  const r = runAbbreviate("The unit launched a counterattack.", "all");
  const row = r.rows.find((x) => x.original.toLowerCase() === "counterattack")!;
  assert.ok(row);
  assert.equal(row.abbr, "C attk");
  assert.notEqual(row.abbr, "counterattk", "must never fall back to naive prefix+abbr concatenation when a dedicated authorized phrase exists");
});

test('"counter attack" typed as two words (the normal case) is completely unaffected by the composite rule', () => {
  const r = runAbbreviate("The counter attack was repelled.", "all");
  assert.equal(r.rows[0].original, "counter attack");
  assert.equal(r.rows[0].abbr, "C attk");
  assert.equal(r.rows[0].status, "ok", "still the ordinary explicit multi-word match, not routed through the composite rule");
});

test("composite rule never shadows an existing exact Section 16 entry", () => {
  // "Accommodation" is itself an explicit entry ("accn"); nothing about it
  // should ever be routed through the composite fallback.
  const r = runAbbreviate("Accommodation was arranged.", "all");
  assert.equal(r.rows[0].abbr, "accn");
  assert.equal(r.rows[0].status, "ok");
});

test("composite rule declines a too-short word rather than guessing (minimum prefix/base guardrail)", () => {
  // "field" alone is already an exact entry (caught before the composite
  // rule is ever reached) and nothing shorter than the guardrail floor
  // should be decomposed — e.g. a short, non-composite word must be left
  // untouched rather than sliced into an arbitrary prefix + coincidental
  // base match.
  const r = runAbbreviate("Field report submitted.", "all");
  assert.equal(r.rows[0].abbr, "fd");
  assert.equal(r.rows[0].status, "ok", "the exact entry, not a rule-derived guess");
});

test("composite rule leaves an unrelated ordinary word untouched when no real composite reading exists", () => {
  const r = runAbbreviate("The database was updated.", "all");
  assert.equal(r.rows.length, 0, '"database" has no exact entry, no plural/verb form, and no valid composite split — must stay plain text, not a fabricated guess');
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

test("coverage report: whole-corpus collision scan finds exactly the known 14, all 14 now handled (Phase 1.5: Sepoy resolved via same-service Rank priority)", () => {
  const r = buildCoverageReport();
  assert.equal(r.fullFormCollisions.length, 14);
  assert.equal(
    r.unresolvedFullFormCollisions.length,
    0,
    "Sepoy was the sole remaining unresolved case; it is now resolved, not deleted or hidden",
  );
  const sepoy = r.fullFormCollisions.find((c) => c.full === "Sepoy");
  assert.ok(sepoy, "Sepoy must still be surfaced in the audit — resolved, not silently dropped from the report");
  assert.equal(sepoy?.forceDifferentiated, false, "both Sepoy entries are Army — a real same-service duplicate, not force-differentiated");
  assert.equal(sepoy?.reverseAmbiguityHandled, false, "Sepoy is not an Annex B reverse-mapping entry");
  assert.equal(sepoy?.sameServiceRankPriorityHandled, true);
  assert.deepEqual(
    sepoy?.candidates.map((c) => c.abbr).sort(),
    ["Sep", "sep"],
    "the non-Rank meaning ('sep', Appointment) must still be listed, not removed",
  );
});

/* ---- Phase 1.5 Part 3: "Sepoy" ambiguity — resolved via data (the dataset's
 * own Rank/tier metadata), not a hardcoded string check. A bare rank word's
 * single most common real-world use is as a rank placed before a name, so
 * within a same-service fullIndex collision, the Rank-category candidate is
 * preferred — the non-Rank meaning is never deleted, only ranked second and
 * still reachable via "context" status / lookupFullExact. Confirmed to
 * generalize to two more real same-service Rank collisions in the corpus
 * (Master Chief Petty Officer, Petty Officer — both Navy, colliding with
 * their own "(Cook)"/"(Medical)"/etc. Appointment siblings' paren-stripped
 * variant), with zero effect on the unrelated cross-force "Commander"
 * collision (Army "Comd" vs Navy "Cdr" — a different service each, so
 * resolveForceEntries's existing force-priority logic still owns it). */
test('Sepoy: bare word abbreviates to the Rank meaning ("Sep"), the Appointment meaning ("sep") still disclosed as context', () => {
  const r = runAbbreviate("Sepoy Karim reported for duty.", "Army");
  assert.equal(r.rows[0].abbr, "Sep");
  assert.equal(r.rows[0].status, "context", "a same-service Rank-priority pick is still disclosed, not silently forced as 'ok'");
  const abbrs = r.rows[0].entries.map((e) => e.abbr).sort();
  assert.deepEqual(abbrs, ["Sep", "sep"], "the non-Rank meaning must still be surfaced, not deleted");
});

test("Sepoy: resolution is case-insensitive and consistent with force='all'", () => {
  const lower = runAbbreviate("The sepoy reported.", "Army");
  const upper = runAbbreviate("SEPOY reported.", "Army");
  const allForce = runAbbreviate("Sepoy Karim reported.", "all");
  assert.equal(lower.rows[0].abbr, "Sep");
  assert.equal(upper.rows[0].abbr, "Sep");
  assert.equal(allForce.rows[0].abbr, "Sep");
});

test("Sepoy fix generalizes: Master Chief Petty Officer / Petty Officer (Navy) also prefer their Rank meaning", () => {
  const mcpo = runAbbreviate("The master chief petty officer reported.", "Navy");
  assert.match(mcpo.output, /\bMCPO\b/);
  const po = runAbbreviate("The petty officer reported.", "Navy");
  assert.match(po.output, /\bPO\b/);
});

test("Sepoy fix does not affect the unrelated cross-force Commander collision (Army Comd vs Navy Cdr)", () => {
  const army = runAbbreviate("Commander addressed the unit.", "Army");
  assert.equal(army.rows[0].abbr, "Comd");
  const navy = runAbbreviate("Commander addressed the unit.", "Navy");
  assert.equal(navy.rows[0].abbr, "Cdr");
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
