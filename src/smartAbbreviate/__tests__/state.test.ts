import test from "node:test";
import assert from "node:assert/strict";
import {
  smartAbbreviateReducer,
  initialSmartAbbreviateState,
  hasUnsavedWork,
  buildSuggestion,
  buildSuggestions,
  type SmartAbbreviateState,
} from "../state.ts";

function setOriginal(state: SmartAbbreviateState, text: string) {
  return smartAbbreviateReducer(state, { type: "SET_ORIGINAL", text });
}

test("normal workflow: original -> generate -> auto-select best -> edit -> matches the core Original->Suggestions->Selection->Editing pipeline", () => {
  let s = setOriginal(initialSmartAbbreviateState, "The officer will attend at 0900 hrs.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  assert.equal(s.status, "loading");

  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    // First candidate drops the time entirely (an information-preservation
    // problem, never auto-corrected/guessed) -> stays invalid; second keeps
    // it -> should be auto-selected instead.
    rawSuggestions: ["The offr will attend at hrs.", "The offr will attend at 0900 hrs."],
    source: "ai",
    force: "all",
  });
  assert.equal(s.status, "ready");
  assert.equal(s.suggestions.length, 2);
  assert.equal(s.suggestions[0].validation.valid, false);
  assert.equal(s.suggestions[1].validation.valid, true);
  assert.equal(s.selectedSuggestionId, s.suggestions[1].id, "auto-select must skip an invalid first candidate for a valid one");
  assert.equal(s.finalResult, s.suggestions[1].text);
  assert.equal(s.finalDirty, false);

  s = smartAbbreviateReducer(s, { type: "SET_FINAL_EDITED", text: s.finalResult + " Confirm attendance." });
  assert.equal(s.finalDirty, true, "editing the final box must mark it dirty");
});

test("2-3 suggestions are supported and rendered in AI-ranked order without reordering", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Move to the depot.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["Mov to the depot.", "Move to the depot area.", "Mov to depot."],
    source: "ai",
    force: "all",
  });
  assert.equal(s.suggestions.length, 3);
  assert.equal(s.suggestions[0].text, "Mov to the depot.");
  assert.equal(s.suggestions[2].text, "Mov to depot.");
});

test("first suggestion valid -> it is auto-selected (the common case)", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out.", "Troops moved out."],
    source: "ai",
    force: "all",
  });
  assert.equal(s.selectedSuggestionId, s.suggestions[0].id);
  assert.equal(s.suggestions[0].validation.valid, true);
});

test("all suggestions invalid: the first one is still auto-selected and visible, never hidden", () => {
  // Both candidates drop the grid reference — a genuine information-
  // preservation problem, which (unlike a compliance problem) is never
  // auto-corrected, so both stay invalid.
  let s = setOriginal(initialSmartAbbreviateState, "The officer will attend the meeting at Grid MD530.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["The offr will attend the meeting.", "The offr will attend."],
    source: "ai",
    force: "all",
  });
  assert.equal(s.suggestions.length, 2);
  assert.ok(s.suggestions.every((sg) => !sg.validation.valid), "both should be invalid for this test to be meaningful");
  assert.equal(s.selectedSuggestionId, s.suggestions[0].id, "first is auto-selected even though invalid");
  assert.equal(s.finalValidation?.valid, false);
});

test("a compliance-broken suggestion is auto-corrected to the engine's guaranteed-valid output and flagged with a correction note", () => {
  let s = setOriginal(initialSmartAbbreviateState, "The officer will attend the meeting.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["The offcr will atnd the mtg."], // fabricated offcr/mtg -> compliance issue -> safe-correctable
    source: "ai",
    force: "all",
  });
  const sug = s.suggestions[0];
  assert.equal(sug.validation.valid, true, "should have been auto-corrected to a valid result");
  assert.ok(sug.correctionNote, "a correction note must be present when auto-correction happened");
  assert.notEqual(sug.text, "The offcr will atnd the mtg.", "text must reflect the corrected version");
});

test("an information-preservation problem is never auto-corrected/guessed — stays Invalid", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Proceed to Grid MD530 at 0900.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["Proceed to Grid."], // drops MD530 and 0900 — not safely correctable
    source: "ai",
    force: "all",
  });
  const sug = s.suggestions[0];
  assert.equal(sug.validation.valid, false);
  assert.equal(sug.correctionNote, null, "must never guess at a missing-information problem");
});

test("switching to a different valid suggestion when there are no unsaved edits happens immediately, no confirmation", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out.", "Troops moved out."],
    source: "ai",
    force: "all",
  });
  const other = s.suggestions[1];
  s = smartAbbreviateReducer(s, { type: "SELECT_SUGGESTION", id: other.id });
  assert.equal(s.pendingConfirmation, null);
  assert.equal(s.selectedSuggestionId, other.id);
  assert.equal(s.finalResult, other.text);
});

test("switching suggestion WITH unsaved final-result edits requires confirmation, never silently discards", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out.", "Troops moved out."],
    source: "ai",
    force: "all",
  });
  const firstSelected = s.selectedSuggestionId;
  s = smartAbbreviateReducer(s, { type: "SET_FINAL_EDITED", text: "tps mov out at 0900." });
  assert.equal(s.finalDirty, true);

  const other = s.suggestions.find((sg) => sg.id !== firstSelected)!;
  s = smartAbbreviateReducer(s, { type: "SELECT_SUGGESTION", id: other.id });
  assert.equal(s.selectedSuggestionId, firstSelected, "must not switch yet — a confirmation is pending");
  assert.deepEqual(s.pendingConfirmation, { kind: "switch-suggestion", targetId: other.id });
  assert.equal(s.finalResult, "tps mov out at 0900.", "hand-edit must still be intact while confirmation is pending");

  // Cancel -> keep edits, stay on original suggestion.
  const cancelled = smartAbbreviateReducer(s, { type: "CANCEL_PENDING_ACTION" });
  assert.equal(cancelled.pendingConfirmation, null);
  assert.equal(cancelled.selectedSuggestionId, firstSelected);
  assert.equal(cancelled.finalResult, "tps mov out at 0900.");

  // Continue -> switch, discarding the hand-edit.
  const confirmed = smartAbbreviateReducer(s, { type: "CONFIRM_PENDING_ACTION" });
  assert.equal(confirmed.pendingConfirmation, null);
  assert.equal(confirmed.selectedSuggestionId, other.id);
  assert.equal(confirmed.finalResult, other.text);
  assert.equal(confirmed.finalDirty, false);
});

test("regeneration that would replace hand-edited work requires confirmation (never silently overwrites)", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "ai",
    force: "all",
  });
  s = smartAbbreviateReducer(s, { type: "SET_FINAL_EDITED", text: "tps mov out at first light." });
  assert.equal(s.finalDirty, true);

  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 2 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 2,
    original: s.originalInput,
    rawSuggestions: ["tps mov out immediately."],
    source: "ai",
    force: "all",
  });
  assert.equal(s.finalResult, "tps mov out at first light.", "hand-edit must survive until the user decides");
  assert.ok(s.pendingConfirmation && s.pendingConfirmation.kind === "apply-regeneration");

  const cancelled = smartAbbreviateReducer(s, { type: "CANCEL_PENDING_ACTION" });
  assert.equal(cancelled.finalResult, "tps mov out at first light.", "Cancel must keep the user's edits");
  assert.equal(cancelled.suggestions.length, 1, "the new suggestions must not have been applied");

  const confirmed = smartAbbreviateReducer(s, { type: "CONFIRM_PENDING_ACTION" });
  assert.equal(confirmed.finalResult, "tps mov out immediately.", "Continue must apply the fresh regeneration");
  assert.equal(confirmed.finalDirty, false);
});

test("regeneration with NO unsaved edits applies immediately, no confirmation needed", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "ai",
    force: "all",
  });
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 2 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 2,
    original: s.originalInput,
    rawSuggestions: ["tps mov out fast."],
    source: "ai",
    force: "all",
  });
  assert.equal(s.pendingConfirmation, null);
  assert.equal(s.finalResult, "tps mov out fast.");
});

test("race condition: an older, slower request's result must never overwrite a newer request's result", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 2 }); // request 2 supersedes request 1
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 2,
    original: s.originalInput,
    rawSuggestions: ["tps mov out (from request 2)."],
    source: "ai",
    force: "all",
  });
  assert.equal(s.finalResult, "tps mov out (from request 2).");

  // Request 1 finally resolves late — must be ignored entirely.
  const afterStaleArrival = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out (from stale request 1)."],
    source: "ai",
    force: "all",
  });
  assert.equal(afterStaleArrival.finalResult, "tps mov out (from request 2).", "the stale request must be a no-op");
  assert.deepEqual(afterStaleArrival, s);
});

test("a stale GENERATE_ERROR from a superseded request is also ignored", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 2 });
  const errored = smartAbbreviateReducer(s, { type: "GENERATE_ERROR", requestId: 1, error: "old failure" });
  assert.equal(errored.error, null, "stale error must not surface");
  assert.equal(errored.status, "loading", "request 2 is still in flight");
});

test("failed-AI workflow: error surfaces, previous valid result and original input are preserved, never stuck loading", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "ai",
    force: "all",
  });
  const goodResult = s.finalResult;

  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 2 });
  s = smartAbbreviateReducer(s, { type: "GENERATE_ERROR", requestId: 2, error: "Could not reach the server." });
  assert.equal(s.status, "ready", "must not be stuck in a loading state");
  assert.equal(s.error, "Could not reach the server.");
  assert.equal(s.finalResult, goodResult, "the previous valid result must be preserved on failure");
  assert.equal(s.originalInput, "Troops moved out.", "original input must be preserved on failure");
});

test("failed-AI workflow with NO prior result: status goes to error, not stuck loading", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, { type: "GENERATE_ERROR", requestId: 1, error: "network down" });
  assert.equal(s.status, "error");
  assert.equal(s.error, "network down");
});

test("Stop/Cancel during generation returns to a usable state without error and without losing prior results", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "ai",
    force: "all",
  });
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 2 });
  s = smartAbbreviateReducer(s, { type: "GENERATE_CANCEL", requestId: 2 });
  assert.equal(s.status, "ready");
  assert.equal(s.error, null);
  assert.equal(s.finalResult, "tps mov out.");
});

test("editing an invalid suggestion re-validates it: fixed text becomes valid/selectable, still-broken text stays invalid", () => {
  // Use a dropped-identifier problem (information-preservation), not a
  // fabricated-abbreviation one — a compliance problem is always
  // auto-corrected to the guaranteed-valid engine output (by design, see
  // the "compliance-broken suggestion is auto-corrected" test above), so it
  // can never be used to test "stays invalid until manually fixed."
  let s = setOriginal(initialSmartAbbreviateState, "The officer will review the request at Grid MD530.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["The offr will review the request.", "The offr will review the request at Grid MD530."],
    source: "ai",
    force: "all",
  });
  const broken = s.suggestions[0];
  assert.equal(broken.validation.valid, false);

  // Still broken after a bad edit.
  let s2 = smartAbbreviateReducer(s, { type: "EDIT_SUGGESTION", id: broken.id, text: "The offr will review." });
  assert.equal(s2.suggestions[0].validation.valid, false);

  // Fixed after a good edit.
  let s3 = smartAbbreviateReducer(s, { type: "EDIT_SUGGESTION", id: broken.id, text: "The offr will review the request at Grid MD530." });
  assert.equal(s3.suggestions[0].validation.valid, true);
});

test("editing the currently-selected suggestion card updates finalResult when finalResult isn't independently dirty", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "ai",
    force: "all",
  });
  const selectedId = s.selectedSuggestionId!;
  s = smartAbbreviateReducer(s, { type: "EDIT_SUGGESTION", id: selectedId, text: "tps mov out now." });
  assert.equal(s.finalResult, "tps mov out now.", "in-sync card edit should flow through to finalResult");
});

test("editing the selected suggestion card does NOT clobber finalResult once the user has independently hand-edited it", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "ai",
    force: "all",
  });
  const selectedId = s.selectedSuggestionId!;
  s = smartAbbreviateReducer(s, { type: "SET_FINAL_EDITED", text: "tps mov out — my own edit." });
  s = smartAbbreviateReducer(s, { type: "EDIT_SUGGESTION", id: selectedId, text: "tps mov out now." });
  assert.equal(s.finalResult, "tps mov out — my own edit.", "the user's independent hand-edit must never be silently overwritten");
});

test("SET_FINAL_EDITED never re-validates synchronously — VALIDATE_FINAL_RESULT is the only thing that updates finalValidation (the debounce boundary)", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "ai",
    force: "all",
  });
  const beforeValidation = s.finalValidation;
  s = smartAbbreviateReducer(s, { type: "SET_FINAL_EDITED", text: "tps mov out to an unauthorized xyzq." });
  assert.equal(s.finalValidation, beforeValidation, "finalValidation must be untouched until VALIDATE_FINAL_RESULT fires");

  s = smartAbbreviateReducer(s, {
    type: "VALIDATE_FINAL_RESULT",
    forText: s.finalResult,
    validation: { valid: false, compliant: false, infoPreserved: true, complianceIssues: [], preservationIssues: [] },
  });
  assert.equal(s.finalValidation?.valid, false);
});

test("VALIDATE_FINAL_RESULT is ignored if the text has moved on since the debounce timer was set (stale-fire guard)", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "SET_FINAL_EDITED", text: "draft A" });
  const beforeValidation = s.finalValidation;
  s = smartAbbreviateReducer(s, { type: "SET_FINAL_EDITED", text: "draft B" }); // supersedes A before the debounce for A fires
  const stale = smartAbbreviateReducer(s, {
    type: "VALIDATE_FINAL_RESULT",
    forText: "draft A",
    validation: { valid: true, compliant: true, infoPreserved: true, complianceIssues: [], preservationIssues: [] },
  });
  assert.equal(stale.finalValidation, beforeValidation, "a validation computed for stale text must not apply");
});

test("empty input (§29): clears suggestions and result state, no AI call implied, back to idle", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "ai",
    force: "all",
  });
  s = setOriginal(s, "");
  assert.equal(s.status, "idle");
  assert.deepEqual(s.suggestions, []);
  assert.equal(s.selectedSuggestionId, null);
  assert.equal(s.finalResult, "");
  assert.equal(s.finalValidation, null);

  const whitespaceOnly = setOriginal(initialSmartAbbreviateState, "   ");
  assert.equal(whitespaceOnly.status, "idle");
});

test("New Message with no unsaved work resets immediately, no confirmation", () => {
  const s = smartAbbreviateReducer(initialSmartAbbreviateState, { type: "REQUEST_NEW_MESSAGE" });
  assert.equal(s.pendingConfirmation, null);
  assert.deepEqual(s, initialSmartAbbreviateState);
});

test("New Message WITH unsaved work requires confirmation; Cancel keeps the work, Continue resets", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  assert.equal(hasUnsavedWork(s), true);

  s = smartAbbreviateReducer(s, { type: "REQUEST_NEW_MESSAGE" });
  assert.deepEqual(s.pendingConfirmation, { kind: "new-message" });
  assert.equal(s.originalInput, "Troops moved out.", "must not clear yet");

  const cancelled = smartAbbreviateReducer(s, { type: "CANCEL_PENDING_ACTION" });
  assert.equal(cancelled.originalInput, "Troops moved out.");
  assert.equal(cancelled.pendingConfirmation, null);

  const confirmed = smartAbbreviateReducer(s, { type: "CONFIRM_PENDING_ACTION" });
  assert.equal(confirmed.originalInput, "");
  assert.equal(confirmed.pendingConfirmation, null);
});

test("RESET clears session content but preserves force/online settings", () => {
  let s = { ...initialSmartAbbreviateState, force: "army", online: false };
  s = setOriginal(s, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "RESET" });
  assert.equal(s.originalInput, "");
  assert.equal(s.force, "army", "force setting must survive a reset");
  assert.equal(s.online, false, "online status must survive a reset — it's real connectivity state, not session content");
});

test("CLEAR_ERROR touches only the error field", () => {
  let s = setOriginal(initialSmartAbbreviateState, "x");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, { type: "GENERATE_ERROR", requestId: 1, error: "boom" });
  s = smartAbbreviateReducer(s, { type: "CLEAR_ERROR" });
  assert.equal(s.error, null);
  assert.equal(s.originalInput, "x");
});

test("COPY_SUCCESS records the history record id without touching editing state", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "ai",
    force: "all",
  });
  const beforeFinal = s.finalResult;
  s = smartAbbreviateReducer(s, { type: "COPY_SUCCESS", recordId: "h_abc123" });
  assert.equal(s.lastCopiedRecordId, "h_abc123");
  assert.equal(s.finalResult, beforeFinal);
});

test("a single-suggestion offline/engine fallback (source: 'engine') is guaranteed valid and auto-selected", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."], // this is exactly what runAbbreviate would itself produce
    source: "engine",
    force: "all",
  });
  assert.equal(s.suggestions.length, 1);
  assert.equal(s.suggestions[0].source, "engine");
  assert.equal(s.suggestions[0].validation.valid, true);
  assert.equal(s.selectedSuggestionId, s.suggestions[0].id);
});

test("a degraded (offline/AI-failed) fallback result carries a notice explaining where it came from, and a real AI success clears any stale notice", () => {
  let s = setOriginal(initialSmartAbbreviateState, "Troops moved out.");
  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 1,
    original: s.originalInput,
    rawSuggestions: ["tps mov out."],
    source: "engine",
    force: "all",
    degradedNotice: "You're offline — showing the JSSDM engine's own result instead.",
  });
  assert.equal(s.notice, "You're offline — showing the JSSDM engine's own result instead.");
  assert.equal(s.finalResult, "tps mov out.", "a usable result must still be applied despite the degradation");

  s = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 2 });
  s = smartAbbreviateReducer(s, {
    type: "GENERATE_SUCCESS",
    requestId: 2,
    original: s.originalInput,
    rawSuggestions: ["tps mov out fast."],
    source: "ai",
    force: "all",
  });
  assert.equal(s.notice, null, "a genuine AI success must clear the stale degraded notice");
});

test("LOAD_FROM_HISTORY re-populates the workspace from a saved record, matching what was stored (the history re-edit flow)", () => {
  const s = smartAbbreviateReducer(initialSmartAbbreviateState, {
    type: "LOAD_FROM_HISTORY",
    original: "Troops moved out.",
    selectedSuggestionText: "tps mov out.",
    finalResult: "tps mov out.",
    recordId: "h_abc",
    force: "all",
  });
  assert.equal(s.originalInput, "Troops moved out.");
  assert.equal(s.finalResult, "tps mov out.");
  assert.equal(s.finalDirty, false, "final matches the selected suggestion text exactly — not dirty");
  assert.equal(s.loadedHistoryRecordId, "h_abc");
  assert.equal(s.status, "ready");
  assert.equal(s.suggestions.length, 1);
});

test("LOAD_FROM_HISTORY correctly marks the workspace dirty when the saved final result had been hand-edited beyond the selected suggestion", () => {
  const s = smartAbbreviateReducer(initialSmartAbbreviateState, {
    type: "LOAD_FROM_HISTORY",
    original: "Troops moved out.",
    selectedSuggestionText: "tps mov out.",
    finalResult: "tps mov out at 0900.",
    recordId: "h_abc",
    force: "all",
  });
  assert.equal(s.finalDirty, true);
  assert.equal(s.finalResult, "tps mov out at 0900.");
});

test("loadedHistoryRecordId is cleared by editing the original input or starting a fresh regeneration — those are new derivations, not edits of the saved record", () => {
  let s = smartAbbreviateReducer(initialSmartAbbreviateState, {
    type: "LOAD_FROM_HISTORY",
    original: "Troops moved out.",
    selectedSuggestionText: "tps mov out.",
    finalResult: "tps mov out.",
    recordId: "h_abc",
    force: "all",
  });
  assert.equal(s.loadedHistoryRecordId, "h_abc");

  const afterEditOriginal = setOriginal(s, "Troops moved out at dawn.");
  assert.equal(afterEditOriginal.loadedHistoryRecordId, null);

  const afterRegenerate = smartAbbreviateReducer(s, { type: "GENERATE_START", requestId: 1 });
  assert.equal(afterRegenerate.loadedHistoryRecordId, null);
});

test("loadedHistoryRecordId survives editing the final result / suggestion — that's still editing the same loaded record", () => {
  let s = smartAbbreviateReducer(initialSmartAbbreviateState, {
    type: "LOAD_FROM_HISTORY",
    original: "Troops moved out.",
    selectedSuggestionText: "tps mov out.",
    finalResult: "tps mov out.",
    recordId: "h_abc",
    force: "all",
  });
  s = smartAbbreviateReducer(s, { type: "SET_FINAL_EDITED", text: "tps mov out at first light." });
  assert.equal(s.loadedHistoryRecordId, "h_abc");
});

test("buildSuggestion/buildSuggestions are pure helpers usable outside the reducer (e.g. by the async hook layer)", () => {
  const list = buildSuggestions("Troops moved out.", ["tps mov out.", "Troops moved out."], "all", "ai");
  assert.equal(list.length, 2);
  assert.equal(list[0].id, "ai_0");
  assert.equal(list[1].id, "ai_1");
  const single = buildSuggestion("Troops moved out.", "tps mov out.", "all", "engine", "engine_0");
  assert.equal(single.source, "engine");
  assert.equal(single.validation.valid, true);
});
