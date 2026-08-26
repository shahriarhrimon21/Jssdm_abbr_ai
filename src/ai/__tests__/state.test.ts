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
