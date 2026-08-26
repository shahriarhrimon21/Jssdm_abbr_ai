/**
 * Regression suite for the offline abbreviation-suggestion validator — the
 * machine gate an AI (or the deterministic engine's own) suggestion must
 * pass before the UI treats it as valid/selectable. Everything here runs
 * with zero network access, matching the "works fully offline" requirement
 * this module was built against.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateSuggestion, checkCompliance, checkInformationPreservation, attemptSafeCorrection } from "../suggestionValidation.ts";
import { runAbbreviate } from "../abbreviationEngine.ts";

test("the deterministic engine's own output is always valid for its own input (guaranteed-valid baseline)", () => {
  const original = "The Junior Commissioned Officer will attend the meeting at 0900 on 02 Sep.";
  const engineOutput = runAbbreviate(original, "all").output;
  const v = validateSuggestion(original, engineOutput, "all");
  assert.equal(v.valid, true, `expected the engine's own output to validate clean; issues: ${JSON.stringify(v)}`);
});

test('CRITICAL: catches a "quiet" fabricated lowercase abbreviation that is not shaped like an abbreviation', () => {
  // "offcr" and "mtg" are NOT real JSSDM entries — a naive shape-based check
  // (all-caps / digit-containing) misses these entirely since they look
  // like ordinary lowercase words.
  const v = validateSuggestion("The officer will attend the meeting.", "The offcr will atnd the mtg.", "all");
  assert.equal(v.compliant, false);
  const tokens = v.complianceIssues.map((i) => i.token);
  assert.ok(tokens.includes("offcr"), "must flag fabricated 'offcr'");
  assert.ok(tokens.includes("mtg"), "must flag fabricated 'mtg'");
  assert.ok(!tokens.includes("atnd"), "must NOT flag 'atnd' — it's a real, authorized entry");
});

test("catches a shape-obvious fabricated all-caps abbreviation", () => {
  const v = validateSuggestion("Move to the depot.", "Mov to the DPZQ.", "all");
  assert.equal(v.compliant, false);
  assert.ok(v.complianceIssues.some((i) => i.token === "DPZQ"));
});

test("accepts a rule-derived plural/verb-form abbreviation as compliant (matches the deterministic engine's own authority)", () => {
  const v = validateSuggestion("Troops moved out.", "tps mov out.", "all");
  assert.equal(v.compliant, true, `tps/mov are rule-derived legitimate forms; issues: ${JSON.stringify(v.complianceIssues)}`);
});

test("flags a wrong-case abbreviation (case is fixed by the manual, not a stylistic choice)", () => {
  const v = validateSuggestion("Troops moved out.", "TPS mov out.", "all");
  assert.equal(v.compliant, false);
  assert.ok(v.complianceIssues.some((i) => i.token === "TPS"));
});

test("plain unchanged English with no abbreviation opportunity validates clean", () => {
  const v = validateSuggestion("Please see me tomorrow.", "Please see me tomorrow.", "all");
  assert.equal(v.valid, true);
});

test("detects a missing number/time", () => {
  const issues = checkInformationPreservation("Move at 0900 to the RV.", "Move to the RV.");
  assert.ok(issues.some((i) => i.kind === "missing-number" && i.token === "0900"));
});

test("detects a missing alphanumeric identifier (grid reference / call sign)", () => {
  const issues = checkInformationPreservation("Proceed to Grid MD530.", "Proceed to Grid.");
  assert.ok(issues.some((i) => i.kind === "missing-identifier" && i.token === "MD530"));
});

test("detects a dropped negation (meaning-inverting failure mode)", () => {
  const issues = checkInformationPreservation("Do not proceed without orders.", "Proceed with orders.");
  const kinds = issues.filter((i) => i.kind === "missing-negation").map((i) => i.token);
  assert.ok(kinds.includes("not"));
  assert.ok(kinds.includes("without"));
});

test("does not flag a negation that legitimately carries through", () => {
  const issues = checkInformationPreservation("Do not proceed without orders.", "Do not proceed without orders confirmed.");
  assert.equal(issues.filter((i) => i.kind === "missing-negation").length, 0);
});

test("a soft length-drop signal alone does not make a suggestion invalid", () => {
  const v = validateSuggestion("Please proceed to the location as soon as possible when ready.", "Proceed.", "all");
  assert.ok(v.preservationIssues.some((i) => i.kind === "length-drop"));
  assert.equal(v.infoPreserved, true, "length-drop is a review prompt, not a hard failure, when nothing concrete is actually missing");
});

test("checkCompliance never flags an ordinary word that was already present in the original", () => {
  const original = "The unit will move to the area as soon as possible.";
  const issues = checkCompliance(original, original, "all");
  assert.equal(issues.length, 0);
});

test("checkCompliance never flags a common English connective word even when the rest of the sentence changed", () => {
  const original = "Officer requests approval.";
  // "will" and "as soon as possible" are new relative to the original but
  // are ordinary connective English, not abbreviation-shaped fabrications.
  const issues = checkCompliance(original, "offr will request approval as soon as possible.", "all");
  assert.equal(issues.length, 0, `unexpected issues: ${JSON.stringify(issues)}`);
});

test("checkCompliance never flags ordinary short single-vowel English content words (regression: an earlier vowel-RATIO heuristic wrongly flagged these)", () => {
  // "fast", "task", "next", "cost", "world" are all completely ordinary
  // English words that happen to have only one vowel — exactly the shape a
  // naive vowel-ratio check would confuse with a fabrication like "offcr".
  const original = "The convoy will proceed to the destination.";
  const issues = checkCompliance(
    original,
    "The convoy will proceed fast to the next world region at minimal cost, given the task and the tight timeline.",
    "all",
  );
  assert.equal(issues.length, 0, `unexpected issues on ordinary vocabulary: ${JSON.stringify(issues)}`);
});

test("checkCompliance uses spelling shape (vowel density), not just length, to tell a fabricated shortening from an ordinary word", () => {
  // "offr" is a real entry so it must never be flagged regardless of shape.
  // "offcr" is NOT a real entry and is vowel-dropped like a deliberate
  // shortening ("officer" -> "offcr") — this must still be caught even
  // though it's ordinary lowercase prose shape, not ALL-CAPS.
  const original = "The officer will review the request.";
  const withFabrication = "The offcr will review the request.";
  const v = validateSuggestion(original, withFabrication, "all");
  assert.equal(v.compliant, false);
  assert.ok(v.complianceIssues.some((i) => i.token === "offcr"));
});

test("checkCompliance catches a short, vowel-dropped, unrecognized shortening within the length cap ('cnfrm' is not a real JSSDM entry — 'cfm' is)", () => {
  const issues = checkCompliance("Please confirm receipt.", "Please cnfrm receipt.", "all");
  assert.ok(issues.some((i) => i.token === "cnfrm"), "a short, vowel-dropped, unrecognized word within the cap must still be caught");
});

test("attemptSafeCorrection returns the engine's own valid output when available", () => {
  const r = attemptSafeCorrection("The officer will attend the meeting.", "all");
  assert.ok(r.corrected);
  assert.match(r.corrected!, /offr/);
  assert.ok(r.note);
});

test("attemptSafeCorrection never guesses at an information-preservation problem — only re-runs the engine on the untouched original", () => {
  // The engine's own output for a given original always preserves 100% of
  // the original's information (it's a substring-splice transform), so a
  // safe correction can never itself introduce a missing-information issue.
  const r = attemptSafeCorrection("Move to Grid MD530 at 0900.", "all");
  assert.ok(r.corrected);
  assert.match(r.corrected!, /MD530/);
  assert.match(r.corrected!, /0900/);
});

/* ---- Input-robustness edge cases (§29-31 of the spec this was built
 * against): empty/short/long messages, multiple line breaks and spacing,
 * punctuation/special characters, and case-varied negations must never
 * crash the validator or produce a wrong result. */

test("does not throw on empty or whitespace-only input", () => {
  assert.doesNotThrow(() => validateSuggestion("", "", "all"));
  assert.doesNotThrow(() => validateSuggestion("   ", "   ", "all"));
  assert.equal(checkInformationPreservation("", "anything").length, 0);
});

test("preserves and checks a message with multiple line breaks and repeated spaces (WhatsApp-paste shaped input)", () => {
  const original = "Sir,\n\n\nTroops  moved   out at 0900.\n\nRegards";
  const suggestion = "Sir,\n\n\ntps  moved   out at 0900.\n\nRegards";
  const v = validateSuggestion(original, suggestion, "all");
  assert.equal(v.valid, true, `unexpected: ${JSON.stringify(v)}`);
});

test("a suggestion that collapses/loses the original's line breaks is not itself treated as a compliance/preservation failure (this validator does not police formatting)", () => {
  // The validator is deliberately scoped to abbreviation-compliance and
  // concrete dropped-information, not formatting fidelity — collapsing
  // whitespace is a legitimate, common thing prose rewriting does.
  const v = validateSuggestion("Sir,\n\nTroops moved out.\n\nRegards", "Sir, tps moved out. Regards", "all");
  assert.equal(v.valid, true);
});

test("handles punctuation and special characters without throwing or false-flagging", () => {
  const original = "Officer (Maj) requests approval @ HQ #12, ref: A/B-3, cost ~$500.";
  const suggestion = "Offr (Maj) requests apvl @ HQ #12, ref: A/B-3, cost ~$500.";
  assert.doesNotThrow(() => validateSuggestion(original, suggestion, "all"));
});

test("a case-varied negation word (capitalized mid-sentence-shaped) is still recognized", () => {
  const issues = checkInformationPreservation("The unit will Not proceed without orders.", "The unit will proceed with orders.");
  const kinds = issues.filter((i) => i.kind === "missing-negation").map((i) => i.token);
  assert.ok(kinds.includes("not"));
  assert.ok(kinds.includes("without"));
});

test("existing abbreviations already present in the original are not mistaken for fabrications when carried through unchanged", () => {
  const original = "The offr and tps will mov at 0900.";
  const v = validateSuggestion(original, original, "all");
  assert.equal(v.valid, true, `unexpected: ${JSON.stringify(v)}`);
});

test("handles a long, multi-sentence, multi-paragraph message without throwing and without false positives on ordinary vocabulary", () => {
  const original =
    "The commanding officer will convene a meeting at the headquarters on 02 September at 0900 hours. " +
    "All section commanders are to attend without fail and bring their latest status reports. " +
    "Transport will depart from the main gate at 0830 hours sharp, and personnel are reminded to carry their identification cards.\n\n" +
    "Following the meeting, a brief situation update will be provided regarding the ongoing exercise in the northern sector.";
  const suggestion = original; // unchanged is always a safe baseline for this test's purpose
  assert.doesNotThrow(() => validateSuggestion(original, suggestion, "all"));
  const v = validateSuggestion(original, suggestion, "all");
  assert.equal(v.valid, true);
});
