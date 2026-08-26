import test from "node:test";
import assert from "node:assert/strict";
import { classifyClosingIntent, applyClosingLine, CLOSING_LINES } from "../whatsappClosing.ts";

/* ---- classifyClosingIntent: the worked examples from the request itself ---- */

test("classifyClosingIntent: report/information examples -> info", () => {
  assert.equal(classifyClosingIntent("The training has been completed successfully."), "info");
  assert.equal(classifyClosingIntent("The party has reached the location at 1600 hrs."), "info");
  assert.equal(classifyClosingIntent("Please be informed the exercise starts Monday."), "info");
  assert.equal(classifyClosingIntent("I would like to inform you that the venue has changed."), "info");
  assert.equal(
    classifyClosingIntent("The following is submitted for your kind information regarding the exercise."),
    "info",
    "'submitted for your kind information' must not be misread as a consideration request",
  );
});

test("classifyClosingIntent: permission examples -> permission", () => {
  assert.equal(classifyClosingIntent("I intend to proceed to Dhaka tomorrow for personal work."), "permission");
  assert.equal(classifyClosingIntent("I request permission to attend the programme tomorrow."), "permission");
  assert.equal(classifyClosingIntent("May I kindly be permitted to attend the programme?"), "permission");
  assert.equal(classifyClosingIntent("I seek permission to proceed on leave from Monday."), "permission");
  assert.equal(
    classifyClosingIntent("I intend to proceed on leave from 10 to 12 September."),
    "permission",
    "Phase 1.5 Part 2 worked example",
  );
});

test("classifyClosingIntent: opinion/decision/consideration examples -> consideration", () => {
  assert.equal(
    classifyClosingIntent(
      "Due to unavailability of train tickets, I had to purchase tickets for 18 August. Accordingly, the hotel booking may kindly be shifted from 19-20 August to 18-19 August.",
    ),
    "consideration",
  );
  assert.equal(
    classifyClosingIntent("The following two options are available for the programme. Option A is recommended due to its operational convenience."),
    "consideration",
  );
  assert.equal(classifyClosingIntent("I request your opinion regarding the proposed schedule."), "consideration");
  assert.equal(classifyClosingIntent("Your kind opinion is requested on the revised plan."), "consideration");
  assert.equal(classifyClosingIntent("Kindly consider the attached proposal."), "consideration");
  assert.equal(classifyClosingIntent("Submitted for your consideration."), "consideration");
  assert.equal(
    classifyClosingIntent("Due to the train schedule, the booking may kindly be shifted to 18-19 August."),
    "consideration",
    "Phase 1.5 Part 2 worked example",
  );
});

test("classifyClosingIntent: priority — permission beats consideration beats info when more than one is genuinely present", () => {
  assert.equal(
    classifyClosingIntent("The programme has been rescheduled to tomorrow. May I kindly be permitted to attend?"),
    "permission",
    "not merely informative just because it also contains information",
  );
  assert.equal(
    classifyClosingIntent("I would like to inform you that the programme has been rescheduled. Your kind opinion regarding the revised schedule is requested."),
    "consideration",
    "the ultimate purpose is seeking an opinion, not the informational lead-in",
  );
});

/* ---- Phase 1.5 Part 2 hardening: reject "simple keyword matching" false
 * positives — a message that merely MENTIONS permission/authorization/
 * consideration-adjacent vocabulary while reporting a past, negated, or
 * already-settled fact must classify as info, not permission/consideration,
 * since the underlying intent (a live request) is not actually present. */
test("classifyClosingIntent: reporting-only sentences that merely mention permission/authorization vocabulary -> info, not permission", () => {
  assert.equal(classifyClosingIntent("No permission is required for this internal transfer."), "info");
  assert.equal(classifyClosingIntent("The gate pass was permitted by the duty officer yesterday."), "info");
  assert.equal(classifyClosingIntent("Authorized personnel only are allowed inside the compound."), "info");
  assert.equal(classifyClosingIntent("Permission was granted for the visit last week."), "info");
});

test("classifyClosingIntent: reporting-only sentences that merely mention decision/advice/judgement vocabulary -> info, not consideration", () => {
  assert.equal(classifyClosingIntent("As per your advice, the training was conducted successfully."), "info");
  assert.equal(classifyClosingIntent("The decision has already been made and communicated to all units."), "info");
  assert.equal(classifyClosingIntent("Kindly note the judgement of the court was announced today."), "info");
});

test("classifyClosingIntent: conversational/acknowledgement messages -> null (no closing forced)", () => {
  assert.equal(classifyClosingIntent("Noted, sir."), null);
  assert.equal(classifyClosingIntent("Yes sir."), null);
  assert.equal(classifyClosingIntent("Thank you, sir."), null);
  assert.equal(classifyClosingIntent("Received, sir."), null);
  assert.equal(classifyClosingIntent(""), null);
  assert.equal(classifyClosingIntent("   "), null);
});

test("exact required wording — lowercase 'sir', 'info' not 'information', 'consideration' not 'opinion'", () => {
  assert.equal(CLOSING_LINES.info, "For your kind info, sir.");
  assert.equal(CLOSING_LINES.permission, "For your kind permission, sir.");
  assert.equal(CLOSING_LINES.consideration, "For your kind consideration, sir.");
});

/* ---- applyClosingLine: full message structure ---- */

test("applyClosingLine inserts the info closing before Regards, with a one-line gap above it, when missing (Test 1)", () => {
  const input = "Assalamualaikum sir,\nThe training has been completed successfully.\nRegards";
  const out = applyClosingLine(input);
  assert.equal(out, "Assalamualaikum sir,\nThe training has been completed successfully.\n\nFor your kind info, sir.\nRegards");
});

test("applyClosingLine inserts the permission closing, with a one-line gap above it, immediately before Regards (Test 3)", () => {
  const input = "Assalamualaikum sir,\nI request permission to proceed to Dhaka tomorrow.\nRegards";
  const out = applyClosingLine(input);
  assert.match(out, /I request permission to proceed to Dhaka tomorrow\.\n\nFor your kind permission, sir\.\nRegards$/);
});

test("applyClosingLine inserts the consideration closing, with a one-line gap above it, immediately before Regards (Test 5)", () => {
  const input = "Assalamualaikum sir,\nI request your opinion regarding the proposed schedule.\nRegards";
  const out = applyClosingLine(input);
  assert.match(out, /I request your opinion regarding the proposed schedule\.\n\nFor your kind consideration, sir\.\nRegards$/);
});

test("applyClosingLine does NOT force a line onto a pure acknowledgement (Test 8)", () => {
  const input = "Noted, sir.";
  assert.equal(applyClosingLine(input), "Noted, sir.");
});

test("applyClosingLine replaces a WRONG closing line rather than stacking a second one, keeping the one-line gap", () => {
  const input = "Assalamualaikum sir,\nI request permission to proceed to Dhaka tomorrow.\nFor your kind consideration, sir.\nRegards";
  const out = applyClosingLine(input);
  const occurrences = (out.match(/For your kind/g) || []).length;
  assert.equal(occurrences, 1, "must not leave both the wrong and the correct line present");
  assert.match(out, /I request permission to proceed to Dhaka tomorrow\.\n\nFor your kind permission, sir\.\nRegards$/);
});

test("applyClosingLine collapses a DUPLICATE closing line down to exactly one, correctly worded, with one gap line", () => {
  const input =
    "Assalamualaikum sir,\nThe training has been completed successfully.\nFor your kind info, sir.\nFor your kind info, sir.\nRegards";
  const out = applyClosingLine(input);
  const occurrences = (out.match(/For your kind info, sir\./g) || []).length;
  assert.equal(occurrences, 1);
  assert.match(out, /The training has been completed successfully\.\n\nFor your kind info, sir\.\nRegards$/);
});

test("applyClosingLine normalizes an already-present extra gap down to exactly one blank line", () => {
  const input = "Assalamualaikum sir,\nThe training has been completed successfully.\n\n\n\nFor your kind info, sir.\nRegards";
  const out = applyClosingLine(input);
  assert.equal(out, "Assalamualaikum sir,\nThe training has been completed successfully.\n\nFor your kind info, sir.\nRegards");
});

test("applyClosingLine never places the closing line after Regards or mid-message", () => {
  const input = "Assalamualaikum sir,\nThe training has been completed successfully.\nRegards\nMaj Rahman";
  const out = applyClosingLine(input);
  const lines = out.split("\n");
  const regardsIdx = lines.findIndex((l) => /^regards\.?$/i.test(l));
  assert.equal(lines[regardsIdx - 1], "For your kind info, sir.");
  assert.equal(lines[regardsIdx - 2], "", "exactly one blank line separates the body from the closing line");
  assert.ok(!lines.slice(regardsIdx + 1).some((l) => /for your kind/i.test(l)), "closing line must never appear after Regards");
  assert.equal(lines[lines.length - 1], "Maj Rahman", "a signature after Regards is preserved");
});

test("applyClosingLine is idempotent", () => {
  const input = "Assalamualaikum sir,\nThe party has reached the location at 1600 hrs.\nRegards";
  const once = applyClosingLine(input);
  const twice = applyClosingLine(once);
  assert.equal(once, twice);
});

test("applyClosingLine handles the mixed-intent example correctly (Test 7)", () => {
  const input = "Assalamualaikum sir,\nThe programme has been rescheduled to tomorrow. May I kindly be permitted to attend?\nRegards";
  const out = applyClosingLine(input);
  assert.match(out, /For your kind permission, sir\.\nRegards$/);
});
