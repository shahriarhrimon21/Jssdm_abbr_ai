import test from "node:test";
import assert from "node:assert/strict";
import { assistantReducer, initialAssistantState } from "../state.ts";

test("REQUEST_SUCCESS sets aiFinal + aiEditedDraft and appends chat, never touches the JSSDM stage", () => {
  const s1 = assistantReducer(initialAssistantState, { type: "SET_ORIGINAL", text: "the tp moved out" });
  const s2 = assistantReducer(s1, { type: "REQUEST_START" });
  assert.equal(s2.loading, true);
  const s3 = assistantReducer(s2, { type: "REQUEST_SUCCESS", text: "The Troop moved out.", userMessage: "polish this" });
  assert.equal(s3.loading, false);
  assert.equal(s3.aiFinal, "The Troop moved out.");
  assert.equal(s3.aiEditedDraft, "The Troop moved out.", "the editable draft starts out equal to the fresh AI response");
  assert.equal(s3.jssdmGenerated, null);
  assert.equal(s3.finalEdited, null);
  assert.equal(s3.original, "the tp moved out", "original must never be overwritten by an AI result");
  assert.equal(s3.chat.length, 2);
});

test("SET_AI_EDITED_DRAFT only ever touches aiEditedDraft, never the immutable aiFinal", () => {
  let s = assistantReducer(initialAssistantState, { type: "REQUEST_SUCCESS", text: "The Troop moved out.", userMessage: "go" });
  s = assistantReducer(s, { type: "SET_AI_EDITED_DRAFT", text: "The Troop moved out successfully." });
  assert.equal(s.aiEditedDraft, "The Troop moved out successfully.", "editing must update the editable draft");
  assert.equal(s.aiFinal, "The Troop moved out.", "the AI's original response is preserved unchanged for the chat/history record");
});

test("JSSDM_GENERATED sets jssdmGenerated+spans AND resets finalEdited to match (an explicit engine run)", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_ORIGINAL", text: "orig" });
  s = assistantReducer(s, { type: "REQUEST_SUCCESS", text: "ai result", userMessage: "go" });
  s = assistantReducer(s, { type: "JSSDM_GENERATED", text: "jssdm result", spans: [] });
  assert.equal(s.original, "orig");
  assert.equal(s.aiFinal, "ai result");
  assert.equal(s.jssdmGenerated, "jssdm result");
  assert.equal(s.finalEdited, "jssdm result", "finalEdited starts out equal to the fresh engine output");
});

test("SET_FINAL_EDITED only touches finalEdited — the JSSDM_GENERATED reference value is untouched by manual edits", () => {
  let s = assistantReducer(initialAssistantState, { type: "JSSDM_GENERATED", text: "The JCO will attend.", spans: [] });
  s = assistantReducer(s, { type: "SET_FINAL_EDITED", text: "The JCO will attend the meeting at 1000 hrs." });
  assert.equal(s.finalEdited, "The JCO will attend the meeting at 1000 hrs.", "manual edit lands in finalEdited");
  assert.equal(s.jssdmGenerated, "The JCO will attend.", "the engine's original generated output is never silently rewritten by a manual edit");
});

test("typing in the final editor never re-invokes the engine on its own (no auto re-abbreviation)", () => {
  // The reducer has no way to "auto-trigger" JSSDM_GENERATED — SET_FINAL_EDITED
  // is the only action a keystroke in that box can dispatch, and it never
  // produces a new jssdmGenerated/spans pair. This test exists to pin that
  // contract down explicitly, since it's the crux of Part 6 of the spec.
  let s = assistantReducer(initialAssistantState, { type: "JSSDM_GENERATED", text: "The JCO will attend.", spans: [{ start: 4, end: 7, cls: "hl-verified", title: "x" }] });
  const beforeSpans = s.jssdmGeneratedSpans;
  s = assistantReducer(s, { type: "SET_FINAL_EDITED", text: "The JCO will attend tomorrow." });
  assert.equal(s.jssdmGeneratedSpans, beforeSpans, "spans (tied to the last engine run) are untouched by a manual final edit");
  assert.equal(s.jssdmGenerated, "The JCO will attend.", "the reference value never silently updates to match typed edits");
});

test("REQUEST_ERROR surfaces the error and clears loading without touching prior results", () => {
  let s = assistantReducer(initialAssistantState, { type: "REQUEST_SUCCESS", text: "keep me", userMessage: "go" });
  s = assistantReducer(s, { type: "REQUEST_START" });
  s = assistantReducer(s, { type: "REQUEST_ERROR", error: "network down" });
  assert.equal(s.loading, false);
  assert.equal(s.error, "network down");
  assert.equal(s.aiFinal, "keep me", "a failed follow-up must not clobber the previous good result");
});

test("a new AI response (REQUEST_SUCCESS) resets aiEditedDraft but preserves an already-edited JSSDM final stage", () => {
  // This is the case Part 10 cares about: the user already ran Send to
  // Abbreviation and hand-edited the result; asking the AI a follow-up
  // question must not silently discard that downstream work.
  let s = assistantReducer(initialAssistantState, { type: "REQUEST_SUCCESS", text: "first ai draft", userMessage: "go" });
  s = assistantReducer(s, { type: "SET_AI_EDITED_DRAFT", text: "first ai draft, edited" });
  s = assistantReducer(s, { type: "JSSDM_GENERATED", text: "jssdm output", spans: [] });
  s = assistantReducer(s, { type: "SET_FINAL_EDITED", text: "jssdm output, hand-edited further" });
  s = assistantReducer(s, { type: "REQUEST_SUCCESS", text: "second ai draft", userMessage: "make it shorter" });
  assert.equal(s.aiFinal, "second ai draft");
  assert.equal(s.aiEditedDraft, "second ai draft", "the editable AI box reflects the AI's new answer");
  assert.equal(s.jssdmGenerated, "jssdm output", "the prior JSSDM stage is not wiped by an unrelated AI follow-up");
  assert.equal(s.finalEdited, "jssdm output, hand-edited further", "the user's hand-edited final text survives an unrelated AI follow-up");
});

test("RESET keeps mode/tone but clears text state", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_TONE", tone: "Urgent" });
  s = assistantReducer(s, { type: "SET_ORIGINAL", text: "x" });
  s = assistantReducer(s, { type: "RESET" });
  assert.equal(s.tone, "Urgent");
  assert.equal(s.original, "");
});

/* ---- WhatsApp mode + session-persistence-relevant fields ----
 * These fields (outputMode, signature, draftInput, followupInput) exist so
 * App.tsx can lift the whole reducer above the page-switching layer and the
 * AI Writing session survives navigating to another feature and back — see
 * the architecture note at the top of state.ts. The tests below aren't a
 * substitute for that architectural fix, but they pin down that none of
 * these fields gets silently dropped or reset by an unrelated action. */

test("SET_OUTPUT_MODE toggles independently of everything else", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  assert.equal(s.outputMode, "whatsapp");
  s = assistantReducer(s, { type: "SET_TONE", tone: "Urgent" });
  assert.equal(s.outputMode, "whatsapp", "changing an unrelated field must not reset outputMode");
});

test("SET_SIGNATURE, SET_DRAFT_INPUT, SET_FOLLOWUP_INPUT are independently settable and survive unrelated actions", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_SIGNATURE", signature: "Maj Hemel" });
  s = assistantReducer(s, { type: "SET_DRAFT_INPUT", text: "half-typed request" });
  s = assistantReducer(s, { type: "SET_FOLLOWUP_INPUT", text: "half-typed followup" });
  assert.equal(s.signature, "Maj Hemel");
  assert.equal(s.draftInput, "half-typed request");
  assert.equal(s.followupInput, "half-typed followup");
  // A request cycle must not clobber unsent draft/followup text or the signature.
  s = assistantReducer(s, { type: "REQUEST_START" });
  s = assistantReducer(s, { type: "REQUEST_SUCCESS", text: "AI reply", userMessage: "half-typed request" });
  assert.equal(s.signature, "Maj Hemel");
  assert.equal(s.followupInput, "half-typed followup", "REQUEST_SUCCESS must not touch followupInput on its own");
});

test("REQUEST_SUCCESS in whatsapp mode still leaves original untouched and the JSSDM stage null", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_ORIGINAL", text: "inform sir troops moved" });
  s = assistantReducer(s, { type: "REQUEST_SUCCESS", text: "Assalamualaikum Sir,\n\nTroops have moved.\n\nRegards", userMessage: "inform sir troops moved" });
  assert.equal(s.original, "inform sir troops moved");
  assert.equal(s.jssdmGenerated, null, "the JSSDM engine must never be invoked implicitly by an AI response");
  assert.match(s.aiFinal!, /^Assalamualaikum Sir,/);
});

test("CLEAR_ERROR only touches error, never the session content", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_ORIGINAL", text: "keep me" });
  s = assistantReducer(s, { type: "REQUEST_ERROR", error: "network down" });
  s = assistantReducer(s, { type: "CLEAR_ERROR" });
  assert.equal(s.error, null);
  assert.equal(s.original, "keep me");
});

/* ---- REQUEST_CANCEL: added for the Phase 2 Priority-0 fix — a Stop click
 * or a superseded (abandoned) in-flight request must clear `loading`
 * without ever setting `error`, since neither case is actually a failure. */

test("REQUEST_CANCEL clears loading without setting an error", () => {
  let s = assistantReducer(initialAssistantState, { type: "REQUEST_START" });
  assert.equal(s.loading, true);
  s = assistantReducer(s, { type: "REQUEST_CANCEL" });
  assert.equal(s.loading, false);
  assert.equal(s.error, null, "a cancel is not a failure — it must never surface an error message");
});

test("REQUEST_CANCEL never touches prior session content (aiFinal, chat, jssdmGenerated, finalEdited)", () => {
  let s = assistantReducer(initialAssistantState, { type: "REQUEST_SUCCESS", text: "kept ai draft", userMessage: "go" });
  s = assistantReducer(s, { type: "JSSDM_GENERATED", text: "kept jssdm", spans: [] });
  s = assistantReducer(s, { type: "REQUEST_START" });
  s = assistantReducer(s, { type: "REQUEST_CANCEL" });
  assert.equal(s.loading, false);
  assert.equal(s.aiFinal, "kept ai draft");
  assert.equal(s.jssdmGenerated, "kept jssdm");
  assert.equal(s.finalEdited, "kept jssdm");
  assert.equal(s.chat.length, 2);
});

test("RESET preserves outputMode and signature alongside mode/tone (settings survive; session content clears)", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_SIGNATURE", signature: "BM" });
  s = assistantReducer(s, { type: "SET_DRAFT_INPUT", text: "some draft" });
  s = assistantReducer(s, { type: "SET_ORIGINAL", text: "orig" });
  s = assistantReducer(s, { type: "JSSDM_GENERATED", text: "generated", spans: [] });
  s = assistantReducer(s, { type: "SET_FINAL_EDITED", text: "hand edited" });
  s = assistantReducer(s, { type: "RESET" });
  assert.equal(s.outputMode, "whatsapp");
  assert.equal(s.signature, "BM");
  assert.equal(s.draftInput, "", "unsent draft text is session content, not a setting, and must clear on RESET");
  assert.equal(s.original, "");
  assert.equal(s.jssdmGenerated, null);
  assert.equal(s.finalEdited, null, "RESET is the one place hand-edited final text IS cleared — it's an explicit full reset, not silent overwrite");
});

/* ---- Phase 1.5 Part 1: loadedHistoryRecordId lifecycle ---- */

test("LOAD_HISTORY_RECORD replaces the entire pipeline and marks the record as loaded", () => {
  const s = assistantReducer(initialAssistantState, {
    type: "LOAD_HISTORY_RECORD",
    recordId: "mh_1",
    outputMode: "whatsapp",
    original: "orig msg",
    aiFinal: "ai msg",
    aiEditedDraft: "edited ai msg",
    jssdmGenerated: "jssdm msg",
    finalEdited: "final msg",
  });
  assert.equal(s.loadedHistoryRecordId, "mh_1");
  assert.equal(s.outputMode, "whatsapp");
  assert.equal(s.original, "orig msg");
  assert.equal(s.aiFinal, "ai msg");
  assert.equal(s.aiEditedDraft, "edited ai msg");
  assert.equal(s.jssdmGenerated, "jssdm msg");
  assert.equal(s.finalEdited, "final msg");
  assert.deepEqual(s.jssdmGeneratedSpans, []);
  assert.deepEqual(s.chat, [
    { role: "user", content: "orig msg" },
    { role: "assistant", content: "ai msg" },
  ]);
});

test("loadedHistoryRecordId survives editing the AI draft, running the engine, and editing the final result", () => {
  let s = assistantReducer(initialAssistantState, {
    type: "LOAD_HISTORY_RECORD",
    recordId: "mh_1",
    outputMode: "text",
    original: "orig",
    aiFinal: "ai",
    aiEditedDraft: "ai",
    jssdmGenerated: null,
    finalEdited: null,
  });
  s = assistantReducer(s, { type: "SET_AI_EDITED_DRAFT", text: "ai edited" });
  assert.equal(s.loadedHistoryRecordId, "mh_1");
  s = assistantReducer(s, { type: "JSSDM_GENERATED", text: "jssdm out", spans: [] });
  assert.equal(s.loadedHistoryRecordId, "mh_1");
  s = assistantReducer(s, { type: "SET_FINAL_EDITED", text: "final edited" });
  assert.equal(s.loadedHistoryRecordId, "mh_1", "editing the final result is still editing the same loaded record");
});

test("SET_ORIGINAL (starting a fresh regeneration) clears loadedHistoryRecordId — a new derivation, not an edit of the loaded record", () => {
  let s = assistantReducer(initialAssistantState, {
    type: "LOAD_HISTORY_RECORD",
    recordId: "mh_1",
    outputMode: "text",
    original: "orig",
    aiFinal: "ai",
    aiEditedDraft: "ai",
    jssdmGenerated: null,
    finalEdited: null,
  });
  s = assistantReducer(s, { type: "SET_ORIGINAL", text: "a brand new topic" });
  assert.equal(s.loadedHistoryRecordId, null);
});

test("RESET clears loadedHistoryRecordId", () => {
  let s = assistantReducer(initialAssistantState, {
    type: "LOAD_HISTORY_RECORD",
    recordId: "mh_1",
    outputMode: "text",
    original: "orig",
    aiFinal: "ai",
    aiEditedDraft: "ai",
    jssdmGenerated: null,
    finalEdited: null,
  });
  s = assistantReducer(s, { type: "RESET" });
  assert.equal(s.loadedHistoryRecordId, null);
});

test("SET_LOADED_HISTORY_RECORD_ID sets the id after a Save as New, so a further save defaults to Update Existing", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_ORIGINAL", text: "orig" });
  s = assistantReducer(s, { type: "SET_LOADED_HISTORY_RECORD_ID", recordId: "mh_new" });
  assert.equal(s.loadedHistoryRecordId, "mh_new");
});

/* ---- Senior/Junior recipient-type toggle ---- */

test("initialAssistantState defaults recipientType to senior (Part 3: existing users see no behaviour change)", () => {
  assert.equal(initialAssistantState.recipientType, "senior");
});

test("SET_RECIPIENT_TYPE toggles independently of everything else", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_RECIPIENT_TYPE", recipientType: "junior" });
  assert.equal(s.recipientType, "junior");
  s = assistantReducer(s, { type: "SET_TONE", tone: "Urgent" });
  assert.equal(s.recipientType, "junior", "changing an unrelated field must not reset recipientType");
});

test("RESET preserves recipientType alongside mode/tone/outputMode/signature (a setting, not session content)", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_RECIPIENT_TYPE", recipientType: "junior" });
  s = assistantReducer(s, { type: "SET_ORIGINAL", text: "orig" });
  s = assistantReducer(s, { type: "RESET" });
  assert.equal(s.recipientType, "junior");
  assert.equal(s.original, "");
});

test("REQUEST_SUCCESS in whatsapp+senior mode keeps the Senior 'sir' closing/greeting behaviour unchanged", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text: "Assalamualaikum Sir,\nThe training has been completed successfully.\nRegards",
    userMessage: "go",
  });
  assert.match(s.aiFinal!, /^Assalamualaikum Sir,/);
  assert.match(s.aiFinal!, /For your kind info, sir\.\nRegards$/);
});

test("REQUEST_SUCCESS in whatsapp+junior mode forces the Dear opener and a sir-free closing, even when the AI ignored the instruction", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_RECIPIENT_TYPE", recipientType: "junior" });
  // Simulate the AI carrying over Senior-style "sir" wording from the raw input anyway.
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text: "Assalamualaikum Sir,\n1. After firing, man and materials are all correct, sir.\nRegards",
    userMessage: "go",
  });
  assert.match(s.aiFinal!, /^Assalamualaikum Dear,/);
  assert.match(s.aiFinal!, /1\. After firing, man and materials are all correct\.$/m);
  assert.match(s.aiFinal!, /For your kind info\.\nRegards$/);
  assert.doesNotMatch(s.aiFinal!, /\bsir\b/i);
  // The editable draft the user sees starts out equal to the corrected text too.
  assert.equal(s.aiEditedDraft, s.aiFinal);
});

/* ---- REGRESSION: Senior + WhatsApp signature-placement bug. The AI's raw
 * output sometimes produced its own premature "Regards,\n<name>" block
 * before the deterministic closing line was inserted, causing a duplicated
 * "Regards" and a misplaced signature. Reproduces the exact reported
 * input/output through the full REQUEST_SUCCESS pipeline (SET_SIGNATURE +
 * applyClosingLine + applyRecipientEtiquette + ensureGreetingBlankLine). ---- */

test("REQUEST_SUCCESS in whatsapp+senior mode with a signature set: exactly one Regards, signature placed only at the very end", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_SIGNATURE", signature: "Capt Shahriar" });
  // The AI's raw (buggy) output as reported: its own "Regards," + signature
  // block, with excess blank lines, and no standard closing line yet.
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text:
      "Assalamualaikum Sir,\n\n\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\n\n\nRegards,\nCapt Shahriar",
    userMessage: "congratulation for marriage",
  });
  assert.equal(
    s.aiFinal,
    "Assalamualaikum Sir,\n\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\n\nFor your kind info, sir.\nRegards\nCapt Shahriar",
  );
  assert.equal((s.aiFinal!.match(/^Regards$/gim) || []).length, 1, "exactly one Regards");
  assert.equal((s.aiFinal!.match(/Capt Shahriar/g) || []).length, 1, "signature appears exactly once");
  assert.equal(s.aiEditedDraft, s.aiFinal);
});

test("REQUEST_SUCCESS in whatsapp+senior mode with no signature set: ends cleanly at Regards, nothing invented", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text: "Assalamualaikum Sir,\n\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\n\nRegards",
    userMessage: "congratulation for marriage",
  });
  assert.equal(
    s.aiFinal,
    "Assalamualaikum Sir,\n\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\n\nFor your kind info, sir.\nRegards",
  );
});

test("REQUEST_SUCCESS regeneration with a signature never duplicates Regards or the signature across repeated generations", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_SIGNATURE", signature: "Capt Shahriar" });
  const raw =
    "Assalamualaikum Sir,\n\nHeartiest congratulations to you on the occasion of your marriage. Wishing you a happy and blessed married life, sir.\n\nRegards,\nCapt Shahriar";
  for (let i = 0; i < 3; i++) {
    s = assistantReducer(s, { type: "REQUEST_SUCCESS", text: raw, userMessage: "congratulation for marriage" });
    assert.equal((s.aiFinal!.match(/^Regards$/gim) || []).length, 1, `pass ${i}: exactly one Regards`);
    assert.equal((s.aiFinal!.match(/Capt Shahriar/g) || []).length, 1, `pass ${i}: signature appears exactly once`);
  }
});

test("REQUEST_SUCCESS in whatsapp+junior mode with a signature set: signature still appears once, after the sir-free Regards", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_RECIPIENT_TYPE", recipientType: "junior" });
  s = assistantReducer(s, { type: "SET_SIGNATURE", signature: "Capt Shahriar" });
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text: "Assalamualaikum Sir,\n1. After firing, man and materials are all correct, sir.\nRegards,\nCapt Shahriar",
    userMessage: "go",
  });
  assert.match(s.aiFinal!, /^Assalamualaikum Dear,/);
  assert.match(s.aiFinal!, /For your kind info\.\nRegards\nCapt Shahriar$/);
  assert.equal((s.aiFinal!.match(/^Regards$/gim) || []).length, 1);
  assert.equal((s.aiFinal!.match(/Capt Shahriar/g) || []).length, 1);
  assert.doesNotMatch(s.aiFinal!, /\bsir\b/i);
});

test("REQUEST_SUCCESS in text mode is unaffected by recipientType (no WhatsApp deterministic passes run)", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_RECIPIENT_TYPE", recipientType: "junior" });
  s = assistantReducer(s, { type: "REQUEST_SUCCESS", text: "Plain generated text, sir.", userMessage: "go" });
  assert.equal(s.aiFinal, "Plain generated text, sir.", "text mode never runs the WhatsApp greeting/closing/etiquette passes");
});

test("switching Senior -> Junior and regenerating (a fresh REQUEST_SUCCESS on the same original) picks up the new recipientType without re-entering the input", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_ORIGINAL", text: "after firing man and materials are okay, sir" });
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text: "Assalamualaikum Sir,\nAfter firing, man and materials are all correct, sir.\nRegards",
    userMessage: "after firing man and materials are okay, sir",
  });
  assert.match(s.aiFinal!, /^Assalamualaikum Sir,/);

  // Toggle to Junior — original is untouched, ready for a regenerate.
  s = assistantReducer(s, { type: "SET_RECIPIENT_TYPE", recipientType: "junior" });
  assert.equal(s.original, "after firing man and materials are okay, sir", "the toggle must not clear the original request");

  // "Regenerate" re-sends the same original as a fresh REQUEST_SUCCESS.
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text: "Assalamualaikum Dear,\nAfter firing, man and materials are all correct.\nRegards",
    userMessage: "after firing man and materials are okay, sir",
  });
  assert.match(s.aiFinal!, /^Assalamualaikum Dear,/);
  assert.doesNotMatch(s.aiFinal!, /\bsir\b/i);
});

test("switching Junior -> Senior and regenerating restores the Senior 'sir' behaviour", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_RECIPIENT_TYPE", recipientType: "junior" });
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text: "Assalamualaikum Dear,\nThe training has been completed successfully.\nRegards",
    userMessage: "go",
  });
  assert.doesNotMatch(s.aiFinal!, /\bsir\b/i);

  s = assistantReducer(s, { type: "SET_RECIPIENT_TYPE", recipientType: "senior" });
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text: "Assalamualaikum Sir,\nThe training has been completed successfully.\nRegards",
    userMessage: "go",
  });
  assert.match(s.aiFinal!, /^Assalamualaikum Sir,/);
  assert.match(s.aiFinal!, /For your kind info, sir\.\nRegards$/);
});

test("editing, copying (via aiEditedDraft/finalEdited), and sending continue to work correctly after introducing the toggle", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_RECIPIENT_TYPE", recipientType: "junior" });
  s = assistantReducer(s, {
    type: "REQUEST_SUCCESS",
    text: "Assalamualaikum Sir,\nThe training has been completed successfully.\nRegards",
    userMessage: "go",
  });
  // Editable draft (what Copy reads) starts out equal to the corrected text.
  assert.equal(s.aiEditedDraft, s.aiFinal);
  // Editing still only ever touches aiEditedDraft.
  s = assistantReducer(s, { type: "SET_AI_EDITED_DRAFT", text: s.aiEditedDraft + " Extra line." });
  assert.notEqual(s.aiEditedDraft, s.aiFinal);
  // JSSDM engine run + final edit (Copy message reads finalEdited) still work unchanged.
  s = assistantReducer(s, { type: "JSSDM_GENERATED", text: "engine output", spans: [] });
  assert.equal(s.finalEdited, "engine output");
  s = assistantReducer(s, { type: "SET_FINAL_EDITED", text: "engine output, hand-edited" });
  assert.equal(s.finalEdited, "engine output, hand-edited");
  // recipientType itself is untouched by any of the above.
  assert.equal(s.recipientType, "junior");
});
