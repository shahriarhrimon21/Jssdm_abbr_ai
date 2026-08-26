/**
 * Regression suite for the Phase 1.5 Part 1 message-history store. Node has
 * no global `localStorage`, so this file installs the same tiny in-memory
 * polyfill pattern already used for jssdm/favorites-style modules before
 * importing the module under test.
 */
import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

(globalThis as any).localStorage = new MemoryStorage();

const {
  addNewMessageHistoryRecord,
  updateMessageHistoryRecord,
  deleteMessageHistoryRecord,
  clearMessageHistory,
  getAllMessageHistory,
  getMessageHistoryRecord,
  searchMessageHistory,
  pipelineFromRecord,
  MESSAGE_HISTORY_LIMIT,
} = await import("../messageHistory.ts");

function reset() {
  (globalThis as any).localStorage.clear();
}

function snap(over: Partial<Parameters<typeof addNewMessageHistoryRecord>[0]> = {}) {
  return {
    messageType: "text" as const,
    original: "Troop movement report.",
    aiFinal: "The Troop movement was reported.",
    aiEditedDraft: null,
    jssdmGenerated: null,
    finalEdited: null,
    ...over,
  };
}

test("addNewMessageHistoryRecord creates a record with all fields the spec requires (adapted shape)", () => {
  reset();
  const r = addNewMessageHistoryRecord(
    snap({
      original: "Personnel are en route.",
      aiFinal: "Personnel are currently en route.",
      aiEditedDraft: "Personnel are currently en route to the site.",
      jssdmGenerated: "pers are currently en route to the site.",
      finalEdited: "pers are currently en route to the site (ETA 1600).",
    }),
  );
  assert.ok(r.id);
  assert.ok(typeof r.createdAt === "number" && r.createdAt > 0);
  assert.equal(r.updatedAt, r.createdAt);
  assert.equal(r.messageType, "text");
  assert.equal(r.originalMessage, "Personnel are en route.");
  assert.equal(r.aiGeneratedMessage, "Personnel are currently en route.");
  assert.equal(r.editedMessage, "Personnel are currently en route to the site.");
  assert.equal(r.abbreviationRan, true);
  assert.equal(r.abbreviatedMessage, "pers are currently en route to the site.");
  assert.equal(r.finalMessage, "pers are currently en route to the site (ETA 1600).", "finalMessage must be the LATEST edited text, not a stale AI/engine result");
  assert.equal(getAllMessageHistory().length, 1);
});

test("record omits editedMessage/abbreviatedMessage when they don't differ from the adjacent stage (no duplicate data)", () => {
  reset();
  const r = addNewMessageHistoryRecord(
    snap({
      aiFinal: "The Troop moved out.",
      aiEditedDraft: "The Troop moved out.", // unedited — same as aiFinal
      jssdmGenerated: "tp moved out.",
      finalEdited: "tp moved out.", // unedited — same as jssdmGenerated
    }),
  );
  assert.equal(r.editedMessage, undefined, "no AI-draft edit happened — must not duplicate aiGeneratedMessage under a second field name");
  assert.equal(r.abbreviationRan, true);
  assert.equal(r.abbreviatedMessage, undefined, "no post-engine edit happened — must not duplicate finalMessage under a second field name");
  assert.equal(r.finalMessage, "tp moved out.");
});

test("record correctly distinguishes 'engine never ran' from 'engine ran but output was already correct' via abbreviationRan", () => {
  reset();
  const neverRan = addNewMessageHistoryRecord(snap({ jssdmGenerated: null, finalEdited: null }));
  assert.equal(neverRan.abbreviationRan, false);
  assert.equal(neverRan.abbreviatedMessage, undefined);

  const ran = addNewMessageHistoryRecord(snap({ jssdmGenerated: "tp moved out.", finalEdited: "tp moved out." }));
  assert.equal(ran.abbreviationRan, true);
  assert.equal(ran.abbreviatedMessage, undefined, "still omitted (identical to finalMessage) but abbreviationRan disambiguates it from 'never ran'");
});

test("pipelineFromRecord round-trips a record back into AssistantState-shaped fields losslessly", () => {
  reset();
  const original = snap({
    aiFinal: "AI text",
    aiEditedDraft: "AI text edited",
    jssdmGenerated: "engine text",
    finalEdited: "final text",
  });
  const r = addNewMessageHistoryRecord(original);
  const p = pipelineFromRecord(r);
  assert.equal(p.original, original.original);
  assert.equal(p.aiFinal, original.aiFinal);
  assert.equal(p.aiEditedDraft, original.aiEditedDraft);
  assert.equal(p.jssdmGenerated, original.jssdmGenerated);
  assert.equal(p.finalEdited, original.finalEdited);
});

test("pipelineFromRecord on a record with no engine run and no draft edit reconstructs nulls correctly (not stale duplicates)", () => {
  reset();
  const r = addNewMessageHistoryRecord(snap({ aiFinal: "AI text", aiEditedDraft: null, jssdmGenerated: null, finalEdited: null }));
  const p = pipelineFromRecord(r);
  assert.equal(p.aiEditedDraft, "AI text", "falls back to aiGeneratedMessage when no distinct edit was stored");
  assert.equal(p.jssdmGenerated, null);
  assert.equal(p.finalEdited, null);
});

/* ---- Part 1 test scenarios: 1 / 10 / 50 / 51 messages ---- */

test("history holds exactly 1 record after 1 save", () => {
  reset();
  addNewMessageHistoryRecord(snap());
  assert.equal(getAllMessageHistory().length, 1);
});

test("history holds exactly 10 records after 10 saves", () => {
  reset();
  for (let i = 0; i < 10; i++) addNewMessageHistoryRecord(snap({ original: `msg ${i}` }));
  assert.equal(getAllMessageHistory().length, 10);
});

test("history holds exactly 50 records after 50 saves (at the cap, nothing evicted yet)", () => {
  reset();
  for (let i = 0; i < 50; i++) addNewMessageHistoryRecord(snap({ original: `msg ${i}` }));
  const all = getAllMessageHistory();
  assert.equal(all.length, 50);
  assert.ok(all.some((r) => r.originalMessage === "msg 0"), "the oldest of exactly 50 must still be present — cap is 50, not fewer");
});

test("the 51st save evicts the oldest (least recently touched) record — FIFO cap at 50", () => {
  reset();
  const ids: string[] = [];
  for (let i = 0; i < 50; i++) ids.push(addNewMessageHistoryRecord(snap({ original: `msg ${i}` })).id);
  const all50 = getAllMessageHistory();
  assert.equal(all50.length, 50);

  addNewMessageHistoryRecord(snap({ original: "msg 50 (the 51st save)" }));
  const all = getAllMessageHistory();
  assert.equal(all.length, 50, "count must stay capped at 50, never grow to 51");
  assert.equal(getMessageHistoryRecord(ids[0]), null, "the oldest/least-recently-touched record (msg 0) must have been evicted");
  assert.ok(all.some((r) => r.originalMessage === "msg 50 (the 51st save)"), "the newly saved record must be present");
  assert.ok(all.some((r) => r.originalMessage === "msg 1"), "the second-oldest record must survive — only exactly one record is evicted");
});

/* ---- Update Existing vs Save as New ---- */

test("updateMessageHistoryRecord (Update Existing) modifies the SAME record — count stays unchanged", () => {
  reset();
  const r1 = addNewMessageHistoryRecord(snap({ original: "first" }));
  addNewMessageHistoryRecord(snap({ original: "second" }));
  assert.equal(getAllMessageHistory().length, 2);

  const updated = updateMessageHistoryRecord(r1.id, snap({ original: "first (revised)", aiFinal: "revised AI text" }));
  assert.ok(updated);
  assert.equal(updated!.id, r1.id, "Update Existing must update the SAME record id, never create a new one");
  assert.equal(updated!.createdAt, r1.createdAt, "createdAt is preserved across an update");
  assert.ok(updated!.updatedAt >= r1.updatedAt, "updatedAt is refreshed");
  assert.equal(getAllMessageHistory().length, 2, "Update Existing must not change the record count");
  assert.equal(getMessageHistoryRecord(r1.id)!.originalMessage, "first (revised)");
});

test("updateMessageHistoryRecord returns null when the record no longer exists (deleted/cleared since it was loaded)", () => {
  reset();
  const r = addNewMessageHistoryRecord(snap());
  deleteMessageHistoryRecord(r.id);
  const result = updateMessageHistoryRecord(r.id, snap());
  assert.equal(result, null, "must not silently create a substitute record — the caller decides how to handle a missing target");
});

test("addNewMessageHistoryRecord (Save as New) ALWAYS creates a distinct record — count increases by 1 even from the same content", () => {
  reset();
  const r1 = addNewMessageHistoryRecord(snap({ original: "same content" }));
  assert.equal(getAllMessageHistory().length, 1);

  const r2 = addNewMessageHistoryRecord(snap({ original: "same content" }));
  assert.notEqual(r2.id, r1.id, "Save as New must never dedupe against an existing record, even identical content");
  assert.equal(getAllMessageHistory().length, 2, "Save as New must always increase the count by exactly 1");
});

/* ---- Delete / Clear All ---- */

test("deleteMessageHistoryRecord removes exactly one record — count decreases by 1", () => {
  reset();
  const r1 = addNewMessageHistoryRecord(snap({ original: "a" }));
  addNewMessageHistoryRecord(snap({ original: "b" }));
  assert.equal(getAllMessageHistory().length, 2);
  deleteMessageHistoryRecord(r1.id);
  assert.equal(getAllMessageHistory().length, 1);
  assert.equal(getMessageHistoryRecord(r1.id), null);
});

test("clearMessageHistory empties the store — count is 0", () => {
  reset();
  for (let i = 0; i < 5; i++) addNewMessageHistoryRecord(snap({ original: `msg ${i}` }));
  assert.equal(getAllMessageHistory().length, 5);
  clearMessageHistory();
  assert.equal(getAllMessageHistory().length, 0);
});

/* ---- Search coverage ---- */

test("searchMessageHistory covers original, AI-generated, edited, abbreviated, and final message text", () => {
  reset();
  addNewMessageHistoryRecord(
    snap({
      original: "UNIQUEORIGINAL text",
      aiFinal: "UNIQUEAIDRAFT text",
      aiEditedDraft: "UNIQUEEDITED text",
      jssdmGenerated: "UNIQUEABBR text",
      finalEdited: "UNIQUEFINAL text",
    }),
  );
  assert.equal(searchMessageHistory("uniqueoriginal").length, 1, "must match original message (case-insensitive)");
  assert.equal(searchMessageHistory("uniqueaidraft").length, 1, "must match the AI-generated message");
  assert.equal(searchMessageHistory("uniqueedited").length, 1, "must match the edited message");
  assert.equal(searchMessageHistory("uniqueabbr").length, 1, "must match the abbreviated message");
  assert.equal(searchMessageHistory("uniquefinal").length, 1, "must match the final message");
  assert.equal(searchMessageHistory("no-such-text-anywhere").length, 0);
});

test("searchMessageHistory with an empty query returns every record unfiltered", () => {
  reset();
  addNewMessageHistoryRecord(snap({ original: "a" }));
  addNewMessageHistoryRecord(snap({ original: "b" }));
  assert.equal(searchMessageHistory("").length, 2);
  assert.equal(searchMessageHistory("   ").length, 2);
});

/* ---- Persistence across refresh/restart (simulated: a fresh read from the
 * same underlying storage, with no in-memory state carried over) ---- */

test("history persists across a simulated page refresh (fresh reads reflect prior writes with no in-memory carryover)", () => {
  reset();
  const r = addNewMessageHistoryRecord(snap({ original: "persisted message" }));
  // getAllMessageHistory/getMessageHistoryRecord never cache — every call
  // re-reads and re-validates the stored envelope from scratch, exactly as
  // it would after a real page reload re-imports this module fresh.
  assert.equal(getAllMessageHistory()[0].originalMessage, "persisted message");
  assert.equal(getMessageHistoryRecord(r.id)?.originalMessage, "persisted message");
});

/* ---- Corruption tolerance (same pattern as the app's other localStorage
 * stores — a bad write must never take down the rest of the history) ---- */

test("a malformed individual record in storage is dropped, not the whole history", () => {
  reset();
  addNewMessageHistoryRecord(snap({ original: "valid record" }));
  const raw = JSON.parse((globalThis as any).localStorage.getItem("jssdm_message_history_v1"));
  raw.records.push({ id: "bad", originalMessage: 42 }); // malformed
  (globalThis as any).localStorage.setItem("jssdm_message_history_v1", JSON.stringify(raw));
  const all = getAllMessageHistory();
  assert.equal(all.length, 1, "the malformed record must be dropped");
  assert.equal(all[0].originalMessage, "valid record", "the valid record must survive");
});

test("totally corrupted storage (unparsable JSON) degrades to empty history rather than throwing", () => {
  reset();
  (globalThis as any).localStorage.setItem("jssdm_message_history_v1", "{not valid json");
  assert.deepEqual(getAllMessageHistory(), []);
});
