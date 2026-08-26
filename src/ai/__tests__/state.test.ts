import test from "node:test";
import assert from "node:assert/strict";
import { assistantReducer, initialAssistantState } from "../state.ts";

test("REQUEST_SUCCESS sets aiFinal and appends chat, never touches jssdmFinal", () => {
  const s1 = assistantReducer(initialAssistantState, { type: "SET_ORIGINAL", text: "the tp moved out" });
  const s2 = assistantReducer(s1, { type: "REQUEST_START" });
  assert.equal(s2.loading, true);
  const s3 = assistantReducer(s2, { type: "REQUEST_SUCCESS", text: "The Troop moved out.", userMessage: "polish this" });
  assert.equal(s3.loading, false);
  assert.equal(s3.aiFinal, "The Troop moved out.");
  assert.equal(s3.jssdmFinal, null);
  assert.equal(s3.original, "the tp moved out", "original must never be overwritten by an AI result");
  assert.equal(s3.chat.length, 2);
});

test("SET_JSSDM_FINAL only ever touches jssdmFinal", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_ORIGINAL", text: "orig" });
  s = assistantReducer(s, { type: "REQUEST_SUCCESS", text: "ai result", userMessage: "go" });
  s = assistantReducer(s, { type: "SET_JSSDM_FINAL", text: "jssdm result" });
  assert.equal(s.original, "orig");
  assert.equal(s.aiFinal, "ai result");
  assert.equal(s.jssdmFinal, "jssdm result");
});

test("REQUEST_ERROR surfaces the error and clears loading without touching prior results", () => {
  let s = assistantReducer(initialAssistantState, { type: "REQUEST_SUCCESS", text: "keep me", userMessage: "go" });
  s = assistantReducer(s, { type: "REQUEST_START" });
  s = assistantReducer(s, { type: "REQUEST_ERROR", error: "network down" });
  assert.equal(s.loading, false);
  assert.equal(s.error, "network down");
  assert.equal(s.aiFinal, "keep me", "a failed follow-up must not clobber the previous good result");
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

test("REQUEST_SUCCESS in whatsapp mode still leaves original untouched and jssdmFinal null", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_ORIGINAL", text: "inform sir troops moved" });
  s = assistantReducer(s, { type: "REQUEST_SUCCESS", text: "Assalamualaikum Sir,\n\nTroops have moved.\n\nRegards", userMessage: "inform sir troops moved" });
  assert.equal(s.original, "inform sir troops moved");
  assert.equal(s.jssdmFinal, null, "the JSSDM engine must never be invoked implicitly by an AI response");
  assert.match(s.aiFinal!, /^Assalamualaikum Sir,/);
});

test("CLEAR_ERROR only touches error, never the session content", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_ORIGINAL", text: "keep me" });
  s = assistantReducer(s, { type: "REQUEST_ERROR", error: "network down" });
  s = assistantReducer(s, { type: "CLEAR_ERROR" });
  assert.equal(s.error, null);
  assert.equal(s.original, "keep me");
});

test("RESET preserves outputMode and signature alongside mode/tone (settings survive; session content clears)", () => {
  let s = assistantReducer(initialAssistantState, { type: "SET_OUTPUT_MODE", outputMode: "whatsapp" });
  s = assistantReducer(s, { type: "SET_SIGNATURE", signature: "BM" });
  s = assistantReducer(s, { type: "SET_DRAFT_INPUT", text: "some draft" });
  s = assistantReducer(s, { type: "SET_ORIGINAL", text: "orig" });
  s = assistantReducer(s, { type: "RESET" });
  assert.equal(s.outputMode, "whatsapp");
  assert.equal(s.signature, "BM");
  assert.equal(s.draftInput, "", "unsent draft text is session content, not a setting, and must clear on RESET");
  assert.equal(s.original, "");
});
