import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyClosingIntent,
  applyClosingLine,
  applyRecipientEtiquette,
  ensureGreetingBlankLine,
  CLOSING_LINES,
  JUNIOR_CLOSING_LINES,
} from "../whatsappClosing.ts";

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
  // "Maj Rahman" here is text the AI itself produced, with no `signature`
  // argument passed — per the signature-ownership fix (see applyClosingLine's
  // header), AI-authored sign-off text is never trusted, so it is discarded
  // rather than preserved. Only the explicit `signature` parameter (tested
  // below) ever produces a line here.
  assert.equal(lines[lines.length - 1], "Regards", "no signature was passed in, so none is invented from the AI's own text");
  assert.ok(!out.includes("Maj Rahman"), "AI-authored sign-off text is discarded, never trusted as the real signature");
});

/* ---- Signature placement (the Senior + WhatsApp skeleton fix): the
 * signature comes ONLY from the explicit `signature` parameter — sourced
 * from the app's own signature field — never from anything the AI wrote.
 * See applyClosingLine's header comment for the bug this fixes: the AI
 * sometimes produced its own "Regards," (or "Regards:") block, which the
 * old exact-match "Regards" detection didn't recognize, so a second,
 * correct "For your kind ..., sir./Regards" pair was appended after it —
 * duplicate "Regards", signature stranded before the real closing. ---- */

test("applyClosingLine places a provided signature on its own line immediately after the single 'Regards', with no blank line between them", () => {
  const input = "Assalamualaikum Sir,\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\nRegards";
  const out = applyClosingLine(input, "senior", "Capt Shahriar");
  assert.equal(
    out,
    "Assalamualaikum Sir,\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\n\nFor your kind info, sir.\nRegards\nCapt Shahriar",
  );
});

test("applyClosingLine with no signature ends cleanly at 'Regards' — no invented name/rank", () => {
  const input = "Assalamualaikum Sir,\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\nRegards";
  const out = applyClosingLine(input, "senior");
  assert.equal(
    out,
    "Assalamualaikum Sir,\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\n\nFor your kind info, sir.\nRegards",
  );
  assert.ok(!/[A-Za-z]/.test(out.split("Regards")[1] || ""), "nothing follows Regards when no signature is supplied");
});

test("REGRESSION (the reported bug): the AI's own premature 'Regards,' + signature block is discarded wholesale and rebuilt as a single correct skeleton", () => {
  // This is exactly the malformed shape the AI produced for the reported
  // bug: its own "Regards," (comma, not the exact "Regards" this function
  // used to require) immediately followed by the signature, with no
  // standard closing line at all yet.
  const aiRaw =
    "Assalamualaikum Sir,\n\n\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\n\n\nRegards,\nCapt Shahriar";
  const out = applyClosingLine(aiRaw, "senior", "Capt Shahriar");
  assert.equal(
    out,
    "Assalamualaikum Sir,\n\n\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\n\nFor your kind info, sir.\nRegards\nCapt Shahriar",
  );
  assert.equal((out.match(/^Regards$/gim) || []).length, 1, "exactly one 'Regards' line");
  assert.equal((out.match(/Capt Shahriar/g) || []).length, 1, "signature appears exactly once");
  assert.equal((out.match(/For your kind/gi) || []).length, 1, "closing line appears exactly once");
  const lines = out.split("\n");
  const regardsIdx = lines.findIndex((l) => l === "Regards");
  assert.equal(lines[regardsIdx + 1], "Capt Shahriar", "signature immediately follows the single Regards, nothing between them");
});

test("a 'Regards:' or 'Regards.' variant from the AI is recognized as its own closing block and replaced, not stacked on top of", () => {
  const withColon = applyClosingLine("Assalamualaikum Sir,\nThe training has been completed successfully.\nRegards:\nCapt Shahriar", "senior", "Capt Shahriar");
  assert.equal((withColon.match(/^Regards$/gim) || []).length, 1);
  assert.equal((withColon.match(/Capt Shahriar/g) || []).length, 1);

  const withPeriod = applyClosingLine("Assalamualaikum Sir,\nThe training has been completed successfully.\nRegards.\nCapt Shahriar", "senior", "Capt Shahriar");
  assert.equal((withPeriod.match(/^Regards$/gim) || []).length, 1);
  assert.equal((withPeriod.match(/Capt Shahriar/g) || []).length, 1);
});

test("signature placement is idempotent — running applyClosingLine twice with the same signature produces the same result", () => {
  const input = "Assalamualaikum Sir,\nThe training has been completed successfully.\nRegards";
  const once = applyClosingLine(input, "senior", "Capt Shahriar");
  const twice = applyClosingLine(once, "senior", "Capt Shahriar");
  assert.equal(once, twice);
});

test("signature is never forced onto a pure acknowledgement that gets no closing line at all", () => {
  const out = applyClosingLine("Noted, sir.", "senior", "Capt Shahriar");
  assert.equal(out, "Noted, sir.", "no Regards/closing applies here, so no signature is appended either");
});

test("a multi-paragraph message still gets the signature only once, at the very end, after the single Regards", () => {
  const input =
    "Assalamualaikum Sir,\n" +
    "1. The convoy departed at 0600 hrs as scheduled.\n" +
    "2. All checkpoints reported clear.\n" +
    "3. The convoy arrived at the destination at 0930 hrs with no incidents.\n" +
    "Regards";
  const out = applyClosingLine(input, "senior", "Capt Shahriar");
  const lines = out.split("\n");
  assert.equal(lines[lines.length - 1], "Capt Shahriar");
  assert.equal(lines[lines.length - 2], "Regards");
  assert.equal((out.match(/Capt Shahriar/g) || []).length, 1);
  assert.equal((out.match(/^Regards$/gim) || []).length, 1);
});

test("Junior mode: signature still appears exactly once after the single sir-free Regards", () => {
  const input = "Assalamualaikum Dear,\nThe training has been completed successfully.\nRegards,\nCapt Shahriar";
  const out = applyClosingLine(input, "junior", "Capt Shahriar");
  assert.match(out, /For your kind info\.\nRegards\nCapt Shahriar$/);
  assert.equal((out.match(/^Regards$/gim) || []).length, 1);
  assert.equal((out.match(/Capt Shahriar/g) || []).length, 1);
  assert.doesNotMatch(out, /\bsir\b/i);
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

/* ---- ensureGreetingBlankLine ---- */

test("ensureGreetingBlankLine inserts a blank line when the AI ran the greeting straight into the body", () => {
  const out = ensureGreetingBlankLine("Assalamualaikum Sir,\nThe patrol has reached the location.\nRegards");
  assert.equal(out, "Assalamualaikum Sir,\n\nThe patrol has reached the location.\nRegards");
});

test("ensureGreetingBlankLine collapses several blank lines after the greeting down to exactly one", () => {
  const out = ensureGreetingBlankLine("Assalamualaikum Sir,\n\n\n\nThe patrol has reached the location.\nRegards");
  assert.equal(out, "Assalamualaikum Sir,\n\nThe patrol has reached the location.\nRegards");
});

test("ensureGreetingBlankLine is a no-op when exactly one blank line is already there", () => {
  const input = "Assalamualaikum Sir,\n\nThe patrol has reached the location.\nRegards";
  assert.equal(ensureGreetingBlankLine(input), input);
});

test("ensureGreetingBlankLine does nothing when the first line isn't a recognized greeting", () => {
  const input = "The patrol has reached the location.\nRegards";
  assert.equal(ensureGreetingBlankLine(input), input);
});

test("ensureGreetingBlankLine does nothing on a single-line or greeting-only message", () => {
  assert.equal(ensureGreetingBlankLine("Noted, sir."), "Noted, sir.");
  assert.equal(ensureGreetingBlankLine("Assalamualaikum Sir,"), "Assalamualaikum Sir,");
});

test("ensureGreetingBlankLine is idempotent", () => {
  const once = ensureGreetingBlankLine("Assalamualaikum Sir,\nThe patrol has reached the location.\nRegards");
  const twice = ensureGreetingBlankLine(once);
  assert.equal(once, twice);
});

/* ---- Senior/Junior recipient type — applyClosingLine ---- */

test("applyClosingLine defaults to Senior ('sir') wording when recipientType is omitted, unchanged from before the toggle existed", () => {
  const input = "Assalamualaikum sir,\nThe training has been completed successfully.\nRegards";
  const withDefault = applyClosingLine(input);
  const explicitSenior = applyClosingLine(input, "senior");
  assert.equal(withDefault, explicitSenior);
  assert.match(withDefault, /For your kind info, sir\.\nRegards$/);
});

test("exact required Junior wording — no 'sir', 'info' not 'information', 'consideration' not 'opinion'", () => {
  assert.equal(JUNIOR_CLOSING_LINES.info, "For your kind info.");
  assert.equal(JUNIOR_CLOSING_LINES.permission, "For your kind permission.");
  assert.equal(JUNIOR_CLOSING_LINES.consideration, "For your kind consideration.");
});

test("applyClosingLine in Junior mode inserts the sir-free info closing", () => {
  const input = "Assalamualaikum Dear,\nThe training has been completed successfully.\nRegards";
  const out = applyClosingLine(input, "junior");
  assert.equal(out, "Assalamualaikum Dear,\nThe training has been completed successfully.\n\nFor your kind info.\nRegards");
});

test("applyClosingLine in Junior mode replaces a Senior-worded closing line rather than stacking both", () => {
  const input = "Assalamualaikum Dear,\nThe training has been completed successfully.\nFor your kind info, sir.\nRegards";
  const out = applyClosingLine(input, "junior");
  const occurrences = (out.match(/For your kind/g) || []).length;
  assert.equal(occurrences, 1);
  assert.match(out, /For your kind info\.\nRegards$/);
  assert.doesNotMatch(out, /sir/i);
});

test("applyClosingLine in Junior mode does NOT force a line onto a pure acknowledgement, same as Senior", () => {
  const input = "Noted.";
  assert.equal(applyClosingLine(input, "junior"), "Noted.");
});

test("applyClosingLine is idempotent in Junior mode too", () => {
  const input = "Assalamualaikum Dear,\nThe party has reached the location at 1600 hrs.\nRegards";
  const once = applyClosingLine(input, "junior");
  const twice = applyClosingLine(once, "junior");
  assert.equal(once, twice);
});

/* ---- Senior/Junior recipient type — applyRecipientEtiquette ---- */

test("applyRecipientEtiquette is a no-op for Senior (and when recipientType is omitted)", () => {
  const input = "Assalamualaikum Sir,\nThe training has been completed successfully.\nFor your kind info, sir.\nRegards";
  assert.equal(applyRecipientEtiquette(input), input);
  assert.equal(applyRecipientEtiquette(input, "senior"), input);
});

test("applyRecipientEtiquette forces the exact 'Assalamualaikum Dear,' opener, overriding whatever greeting the AI produced", () => {
  const input = "Assalamualaikum Sir,\nThe training has been completed successfully.\nRegards";
  const out = applyRecipientEtiquette(input, "junior");
  assert.match(out, /^Assalamualaikum Dear,/);
});

test("applyRecipientEtiquette inserts the opener when the message has no recognizable greeting at all", () => {
  const out = applyRecipientEtiquette("The training has been completed successfully.\nRegards", "junior");
  assert.equal(out, "Assalamualaikum Dear,\n\nThe training has been completed successfully.\nRegards");
});

test("applyRecipientEtiquette strips a stray ', sir' carried over from a Senior-style draft, preserving the trailing period", () => {
  const input = "Assalamualaikum Sir,\n1. After firing, man and materials are all correct, sir.\n2. Total firers: 106.\nRegards";
  const out = applyRecipientEtiquette(input, "junior");
  assert.match(out, /1\. After firing, man and materials are all correct\.$/m);
  assert.doesNotMatch(out, /sir/i);
});

test("applyRecipientEtiquette never touches the enforced greeting line itself while scrubbing the rest", () => {
  // The greeting is REPLACED outright (not scrubbed) — this pins that the
  // scrub pass only ever runs on lines after index 0.
  const out = applyRecipientEtiquette("Assalamualaikum Sir,\nNoted, sir.\nRegards", "junior");
  const lines = out.split("\n");
  assert.equal(lines[0], "Assalamualaikum Dear,");
});

test("applyRecipientEtiquette removes a repeated 'Dear' from the body without touching the opener", () => {
  const out = applyRecipientEtiquette("Assalamualaikum Sir,\nDear, please note the schedule has changed.\nRegards", "junior");
  const lines = out.split("\n");
  assert.equal(lines[0], "Assalamualaikum Dear,");
  assert.doesNotMatch(lines.slice(1).join("\n"), /Dear/);
});

test("applyRecipientEtiquette is idempotent", () => {
  const input = "Assalamualaikum Sir,\n1. Kote and ammo guard are sealed, sir.\nRegards";
  const once = applyRecipientEtiquette(input, "junior");
  const twice = applyRecipientEtiquette(once, "junior");
  assert.equal(once, twice);
});

/* ---- End-to-end: applyClosingLine + applyRecipientEtiquette combined,
 * matching the exact worked example from the Senior/Junior toggle spec. ---- */

test("Senior vs Junior on the same firing-status input — worked example from the spec", () => {
  const aiDraft =
    "Assalamualaikum Sir,\n" +
    "1. After firing, man and materials are all correct, sir.\n" +
    "2. Total firers: 106.\n" +
    "3. Total ammo fired: 1108.\n" +
    "4. Kote and ammo guard are sealed, sir.\n" +
    "Regards";

  const senior = applyRecipientEtiquette(applyClosingLine(aiDraft, "senior"), "senior");
  assert.match(senior, /^Assalamualaikum Sir,/);
  assert.match(senior, /1\. After firing, man and materials are all correct, sir\./);
  assert.match(senior, /4\. Kote and ammo guard are sealed, sir\./);
  assert.match(senior, /For your kind info, sir\.\nRegards$/);

  const junior = applyRecipientEtiquette(applyClosingLine(aiDraft, "junior"), "junior");
  assert.match(junior, /^Assalamualaikum Dear,/);
  assert.match(junior, /1\. After firing, man and materials are all correct\./);
  assert.match(junior, /4\. Kote and ammo guard are sealed\./);
  assert.match(junior, /For your kind info\.\nRegards$/);
  assert.doesNotMatch(junior, /\bsir\b/i);
});
