/**
 * Local (browser-only) history store for the Smart Abbreviate feature —
 * "last 50 copied records," per the offline-first Phase 1 spec this was
 * built against. No account, no login, no cloud sync, no network call
 * anywhere in this file: everything here is synchronous localStorage
 * read/write, which is what makes history work fully offline (view, open,
 * search, edit, update, save-as-new, delete, clear-all — all of it).
 *
 * A record is only ever created by a SUCCESSFUL Copy — never by generation,
 * editing, or regeneration alone (recordCopy() is the one entry point the
 * Copy action calls). Each record holds exactly what the spec asks for:
 * the original message, the AI suggestion that was selected, the final
 * (possibly hand-edited) result, and a timestamp — never the unselected
 * suggestions.
 *
 * Storage shape is a versioned envelope ({version, records}) rather than a
 * bare array, so a future format change has somewhere to migrate from
 * instead of just discarding old data. Individual malformed records are
 * dropped on load (isValidRecord), not the whole history — one corrupted
 * entry (a bad manual localStorage edit, a partial write cut off by a
 * quota error, etc.) must never wipe out every other valid record.
 */

export interface HistoryRecord {
  id: string;
  original: string;
  selectedSuggestion: string;
  finalResult: string;
  timestamp: number;
}

const STORAGE_KEY = "jssdm_smart_history_v1";
const CURRENT_VERSION = 1;
export const HISTORY_LIMIT = 50;

interface StoredEnvelope {
  version: number;
  records: HistoryRecord[];
}

function isValidRecord(x: unknown): x is HistoryRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.original === "string" &&
    typeof r.selectedSuggestion === "string" &&
    typeof r.finalResult === "string" &&
    typeof r.timestamp === "number" &&
    Number.isFinite(r.timestamp)
  );
}

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

/** Reads and validates stored history, tolerating both a totally corrupted
 *  blob (unparsable JSON, wrong top-level shape — falls back to empty) and a
 *  partially corrupted one (some individual records malformed — those are
 *  silently dropped, the rest are kept). Always returns newest-first. */
function readEnvelope(): HistoryRecord[] {
  if (!storageAvailable()) return [];
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  let candidateRecords: unknown[];
  if (Array.isArray(parsed)) {
    // Tolerate a bare-array legacy/unexpected shape rather than discarding it.
    candidateRecords = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).records)) {
    candidateRecords = (parsed as any).records;
  } else {
    return [];
  }

  const valid = candidateRecords.filter(isValidRecord);
  valid.sort((a, b) => b.timestamp - a.timestamp);
  return valid;
}

function writeEnvelope(records: HistoryRecord[]): void {
  if (!storageAvailable()) return;
  const envelope: StoredEnvelope = { version: CURRENT_VERSION, records };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota exceeded, storage disabled (e.g. Safari private browsing), or
    // any other write failure — degrade gracefully rather than throwing and
    // breaking the caller's flow. The in-memory result the caller has is
    // still returned to them; it just won't have persisted.
  }
}

function genId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `h_${Date.now().toString(36)}_${rand}`;
}

/** Newest-first list of every stored record. */
export function getAllHistory(): HistoryRecord[] {
  return readEnvelope();
}

export function getHistoryRecord(id: string): HistoryRecord | null {
  return readEnvelope().find((r) => r.id === id) || null;
}

/** Case-insensitive substring search across the original message, the final
 *  edited result, and (when practical, per the spec) the selected AI
 *  suggestion. Pass an explicit `records` list to search within an
 *  already-filtered set; omit it to search the full stored history. */
export function searchHistory(query: string, records?: HistoryRecord[]): HistoryRecord[] {
  const list = records ?? readEnvelope();
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (r) =>
      r.original.toLowerCase().includes(q) ||
      r.finalResult.toLowerCase().includes(q) ||
      r.selectedSuggestion.toLowerCase().includes(q),
  );
}

function capToLimit(records: HistoryRecord[]): HistoryRecord[] {
  if (records.length <= HISTORY_LIMIT) return records;
  // Newest-first order means the oldest are always at the end.
  return records.slice(0, HISTORY_LIMIT);
}

/**
 * The Copy action's entry point. Avoids duplicate records: if the exact same
 * (original, finalResult) pair as an existing record is copied again, that
 * existing record is moved to the top and its timestamp (and selected
 * suggestion, in case a different one happened to produce the same final
 * text) is refreshed, instead of creating a second record for the same
 * content.
 */
export function recordCopy(original: string, selectedSuggestion: string, finalResult: string): HistoryRecord {
  const records = readEnvelope();
  const existingIdx = records.findIndex((r) => r.original === original && r.finalResult === finalResult);
  const now = Date.now();

  if (existingIdx !== -1) {
    const updated: HistoryRecord = { ...records[existingIdx], selectedSuggestion, timestamp: now };
    const rest = records.filter((_, i) => i !== existingIdx);
    const next = [updated, ...rest];
    writeEnvelope(next);
    return updated;
  }

  const created: HistoryRecord = { id: genId(), original, selectedSuggestion, finalResult, timestamp: now };
  const next = capToLimit([created, ...records]);
  writeEnvelope(next);
  return created;
}

/**
 * "Save as New" from a re-edited history item — always creates a distinct
 * record, deliberately bypassing recordCopy()'s dedup-and-move-to-top
 * behaviour, since the whole point of choosing Save as New is to keep the
 * original record untouched alongside a new one.
 */
export function addNewHistoryRecord(original: string, selectedSuggestion: string, finalResult: string): HistoryRecord {
  const records = readEnvelope();
  const created: HistoryRecord = { id: genId(), original, selectedSuggestion, finalResult, timestamp: Date.now() };
  const next = capToLimit([created, ...records]);
  writeEnvelope(next);
  return created;
}

/**
 * "Update Existing" from a re-edited history item — modifies the specific
 * record's fields in place and refreshes its timestamp (moving it to the
 * top of the newest-first list, matching how every other "this record was
 * just touched" action behaves). Returns null if the record no longer
 * exists (e.g. it was deleted or history was cleared since it was opened).
 */
export function updateHistoryRecord(
  id: string,
  patch: Partial<Pick<HistoryRecord, "original" | "selectedSuggestion" | "finalResult">>,
): HistoryRecord | null {
  const records = readEnvelope();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: HistoryRecord = { ...records[idx], ...patch, timestamp: Date.now() };
  const rest = records.filter((_, i) => i !== idx);
  writeEnvelope([updated, ...rest]);
  return updated;
}

export function deleteHistoryRecord(id: string): void {
  const records = readEnvelope();
  writeEnvelope(records.filter((r) => r.id !== id));
}

export function clearHistory(): void {
  writeEnvelope([]);
}
