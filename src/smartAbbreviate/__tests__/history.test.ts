/**
 * Regression suite for the offline Smart Abbreviate history store. Node has
 * no global `localStorage`, so this file installs a tiny in-memory
 * polyfill before importing the module under test — the module itself
 * already has to tolerate `localStorage` being absent/throwing (that's
 * exactly what makes it safe in real browsers with storage disabled), and
 * this polyfill is what lets the *storing* behaviour itself be exercised
 * here rather than only the "storage unavailable" fallback path.
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
  recordCopy,
  addNewHistoryRecord,
  updateHistoryRecord,
  deleteHistoryRecord,
  clearHistory,
  getAllHistory,
  getHistoryRecord,
  searchHistory,
  HISTORY_LIMIT,
} = await import("../history.ts");

function reset() {
  (globalThis as any).localStorage.clear();
}

test("recordCopy creates a new record with all four required fields", () => {
  reset();
  const r = recordCopy("The officer will attend.", "The offr will attend.", "The offr will attend the mtg.");
  assert.ok(r.id);
  assert.equal(r.original, "The officer will attend.");
  assert.equal(r.selectedSuggestion, "The offr will attend.");
  assert.equal(r.finalResult, "The offr will attend the mtg.");
  assert.ok(typeof r.timestamp === "number" && r.timestamp > 0);
  assert.equal(getAllHistory().length, 1);
});

test("getAllHistory returns newest-first", () => {
  reset();
  recordCopy("first original", "s1", "f1");
  recordCopy("second original", "s2", "f2");
  const all = getAllHistory();
  assert.equal(all.length, 2);
  assert.equal(all[0].original, "second original", "most recently copied record must be first");
});

test("recordCopy avoids duplicate records: copying the same (original, finalResult) again moves the existing record to the top and refreshes its timestamp instead of duplicating", () => {
  reset();
  const first = recordCopy("orig A", "suggestion 1", "final A");
  recordCopy("orig B", "suggestion X", "final B");
  assert.equal(getAllHistory().length, 2);

  const secondCopy = recordCopy("orig A", "suggestion 2 (different wording, same final)", "final A");
  const all = getAllHistory();
  assert.equal(all.length, 2, "must not create a third record for an unchanged repeat copy");
  assert.equal(all[0].id, first.id, "the existing record moves to the top rather than duplicating");
  assert.equal(all[0].original, "orig A");
  assert.ok(secondCopy.timestamp >= first.timestamp, "timestamp must be refreshed");
  assert.equal(all[0].selectedSuggestion, "suggestion 2 (different wording, same final)");
});

test("recordCopy treats a genuinely different final result for the same original as a distinct record", () => {
  reset();
  recordCopy("same original text", "s1", "final v1");
  recordCopy("same original text", "s2", "final v2 — actually edited");
  assert.equal(getAllHistory().length, 2, "a changed final result is a new record, not a duplicate");
});

test("history is capped at 50 records, oldest dropped automatically, newest-first order preserved", () => {
  reset();
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
    recordCopy(`original ${i}`, `suggestion ${i}`, `final ${i}`);
  }
  const all = getAllHistory();
  assert.equal(all.length, HISTORY_LIMIT);
  assert.equal(all[0].original, `original ${HISTORY_LIMIT + 9}`, "the most recent record must survive");
  assert.equal(
    all[all.length - 1].original,
    `original 10`,
    "the oldest 10 records must have been dropped to stay at the cap",
  );
});

test("getHistoryRecord finds a record by id, or returns null", () => {
  reset();
  const r = recordCopy("orig", "sug", "final");
  assert.equal(getHistoryRecord(r.id)?.original, "orig");
  assert.equal(getHistoryRecord("does-not-exist"), null);
});

test("searchHistory matches on original, final result, and selected suggestion, case-insensitively", () => {
  reset();
  recordCopy("Move troops to the depot", "Mov tps to the depot", "Mov tps to the depot at 0900");
  recordCopy("Officer requests approval", "Offr requests apvl", "Offr requests apvl for leave");
  const byOriginal = searchHistory("TROOPS");
  assert.equal(byOriginal.length, 1);
  assert.match(byOriginal[0].original, /troops/i);

  const byFinal = searchHistory("0900");
  assert.equal(byFinal.length, 1);

  const bySuggestion = searchHistory("apvl");
  assert.equal(bySuggestion.length, 1);
  assert.match(bySuggestion[0].selectedSuggestion, /apvl/i);
});

test("searchHistory with an empty/whitespace query returns everything unfiltered", () => {
  reset();
  recordCopy("a", "b", "c");
  recordCopy("d", "e", "f");
  assert.equal(searchHistory("").length, 2);
  assert.equal(searchHistory("   ").length, 2);
});

test("deleteHistoryRecord removes exactly one record and leaves the rest untouched", () => {
  reset();
  const r1 = recordCopy("orig1", "s1", "f1");
  const r2 = recordCopy("orig2", "s2", "f2");
  deleteHistoryRecord(r1.id);
  const all = getAllHistory();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, r2.id);
});

test("clearHistory empties the store completely", () => {
  reset();
  recordCopy("a", "b", "c");
  recordCopy("d", "e", "f");
  clearHistory();
  assert.deepEqual(getAllHistory(), []);
});

test("addNewHistoryRecord always creates a distinct record — 'Save as New' must not collapse into an identical existing one", () => {
  reset();
  const original = recordCopy("orig", "s1", "same final text");
  const savedAsNew = addNewHistoryRecord("orig", "s1", "same final text");
  assert.notEqual(savedAsNew.id, original.id);
  assert.equal(getAllHistory().length, 2, "Save as New must keep both records even though content is identical");
});

test("updateHistoryRecord ('Update Existing') modifies the specific record in place and keeps its id", () => {
  reset();
  const r = recordCopy("orig", "s1", "final v1");
  const updated = updateHistoryRecord(r.id, { finalResult: "final v2, hand-edited" });
  assert.ok(updated);
  assert.equal(updated!.id, r.id);
  assert.equal(updated!.finalResult, "final v2, hand-edited");
  assert.equal(updated!.original, "orig", "fields not included in the patch are preserved");
  assert.equal(getAllHistory().length, 1, "Update Existing must not create a second record");
});

test("updateHistoryRecord returns null for a record that no longer exists", () => {
  reset();
  assert.equal(updateHistoryRecord("nope", { finalResult: "x" }), null);
});

test("corrupted stored JSON (unparsable) is treated as empty history rather than throwing", () => {
  reset();
  (globalThis as any).localStorage.setItem("jssdm_smart_history_v1", "{not valid json");
  assert.deepEqual(getAllHistory(), []);
});

test("partially corrupted stored records are dropped individually — one bad record does not wipe out the valid ones", () => {
  reset();
  const goodRecord = { id: "h_good", original: "keep me", selectedSuggestion: "s", finalResult: "f", timestamp: Date.now() };
  const badRecord1 = { id: "h_bad1", original: 12345 /* wrong type */, selectedSuggestion: "s", finalResult: "f", timestamp: 1 };
  const badRecord2 = { original: "missing id entirely", selectedSuggestion: "s", finalResult: "f", timestamp: 1 };
  (globalThis as any).localStorage.setItem(
    "jssdm_smart_history_v1",
    JSON.stringify({ version: 1, records: [goodRecord, badRecord1, badRecord2] }),
  );
  const all = getAllHistory();
  assert.equal(all.length, 1, "only the structurally valid record should survive");
  assert.equal(all[0].id, "h_good");
});

test("a bare-array legacy shape (no version envelope) is still tolerated rather than discarded", () => {
  reset();
  const rec = { id: "h_legacy", original: "o", selectedSuggestion: "s", finalResult: "f", timestamp: 5 };
  (globalThis as any).localStorage.setItem("jssdm_smart_history_v1", JSON.stringify([rec]));
  const all = getAllHistory();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, "h_legacy");
});

test("when localStorage is unavailable, every function degrades gracefully instead of throwing", async () => {
  const saved = (globalThis as any).localStorage;
  delete (globalThis as any).localStorage;
  try {
    assert.deepEqual(getAllHistory(), []);
    const r = recordCopy("a", "b", "c");
    assert.ok(r.id, "an in-memory result is still returned even though nothing persisted");
    assert.deepEqual(searchHistory("a"), [], "nothing to search since nothing could persist");
    deleteHistoryRecord("whatever");
    clearHistory();
  } finally {
    (globalThis as any).localStorage = saved;
  }
});

test("a quota-exceeded (or any other) write failure degrades gracefully — the caller still gets a usable in-memory result instead of a crash", () => {
  reset();
  const real = (globalThis as any).localStorage;
  const throwing = {
    getItem: real.getItem.bind(real),
    setItem: () => {
      const err: any = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    },
    removeItem: real.removeItem.bind(real),
    clear: real.clear.bind(real),
  };
  (globalThis as any).localStorage = throwing;
  try {
    assert.doesNotThrow(() => recordCopy("a", "b", "c"));
    const r = recordCopy("a", "b", "c");
    assert.ok(r.id, "an in-memory result is still returned even though the write failed");
  } finally {
    (globalThis as any).localStorage = real;
  }
});
