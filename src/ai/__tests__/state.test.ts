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
