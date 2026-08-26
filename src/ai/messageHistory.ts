/**
 * The dedicated "last 50 message history" store for the AI Writing
 * Assistant workflow (Phase 1.5 Part 1) — deliberately separate from
 * src/jssdm/favorites.ts's Favorites/Recent (lookup bookmarking) and from
 * any search/recent-lookup history: this module records finished/saved
 * MESSAGES (Original -> AI -> edited -> abbreviated -> final), not JSSDM
 * dictionary entries or search queries. Those other systems continue to
 * exist unchanged; nothing here reads or writes their storage keys.
 *
 * Architecture mirrors the localStorage-only pattern already proven in this
 * app (jssdm/favorites.ts, and the removed smartAbbreviate/history.ts this
 * was modeled on): a versioned envelope ({version, records}) rather than a
 * bare array, so a future format change has somewhere to migrate from;
 * individual malformed records are dropped on load rather than discarding
 * the whole history; every write is best-effort (a full/disabled storage
 * degrades silently rather than throwing and breaking the caller's flow).
 * Everything here is synchronous localStorage access — no network call
 * anywhere in this file — which is what makes the whole history workflow
 * (view, open, search, edit, update, save-as-new, delete, clear-all) work
 * fully offline, and what makes it survive a page refresh or full browser
 * restart with no server/account involved.
 *
 * Record shape — adapted from the request's own example
 * ({id, createdAt, updatedAt, messageType, originalMessage,
 * aiGeneratedMessage, editedMessage, abbreviatedMessage, finalMessage}) to
 * this app's actual five-stage pipeline (see ai/state.ts's header comment):
 * `editedMessage` and `abbreviatedMessage` are only stored when they
 * actually differ from the stage next to them — "don't duplicate identical
 * data across pipeline stages unnecessarily" (Part 1) — so a record where
 * the user never touched the AI draft, or never ran the engine further
 * after it produced the final text, does not carry a second copy of the
 * same string under a different field name. `abbreviationRan` is the one
 * bit that can't be inferred from the (possibly-omitted) `abbreviatedMessage`
 * field alone — without it, "the engine ran and happened to produce output
 * identical to its input" would be indistinguishable from "the engine never
 * ran at all" once `abbreviatedMessage` is omitted for being a duplicate.
 */
import type { OutputMode } from "./whatsappStyle.ts";

export interface MessageHistoryRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** The app's own existing Text/WhatsApp output-mode terminology — reused
   *  as-is rather than inventing a new "message type" vocabulary. */
  messageType: OutputMode;
  /** Exactly what the user typed/pasted to ask the AI for something. */
  originalMessage: string;
  /** The AI's own output, verbatim, for the turn this record was saved
   *  from (never a stale earlier turn — see buildPipelineFields below). */
  aiGeneratedMessage: string;
  /** The user's hand-edited AI draft — present only when it actually
   *  differs from aiGeneratedMessage (i.e. an edit really happened). */
  editedMessage?: string;
  /** True iff Send to Abbreviation / Re-abbreviate / De-abbreviate was run
   *  at least once for this record. */
  abbreviationRan: boolean;
  /** The JSSDM engine's own last output — present only when abbreviationRan
   *  is true AND it differs from finalMessage (i.e. the user hand-edited
   *  the result further after the engine ran). */
  abbreviatedMessage?: string;
  /** What the user actually finalized — the authoritative field. Always the
   *  *latest edited* text at whatever stage the workflow had reached when
   *  this record was saved, never a stale AI/engine result the user has
   *  since edited past (Final Principle 4/7). */
  finalMessage: string;
}

/** The live pipeline values a caller (AIWritingAssistant) has in hand when
 *  saving — mirrors AssistantState's five text fields (see ai/state.ts) plus
 *  the output mode, without importing AssistantState itself (keeps this
 *  storage module framework/state-shape independent, same as favorites.ts). */
export interface PipelineSnapshot {
  messageType: OutputMode;
  original: string;
  aiFinal: string;
  aiEditedDraft: string | null;
  jssdmGenerated: string | null;
  finalEdited: string | null;
}

const STORAGE_KEY = "jssdm_message_history_v1";
const CURRENT_VERSION = 1;
export const MESSAGE_HISTORY_LIMIT = 50;

interface StoredEnvelope {
  version: number;
  records: MessageHistoryRecord[];
}

function isValidRecord(x: unknown): x is MessageHistoryRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.createdAt === "number" &&
    Number.isFinite(r.createdAt) &&
    typeof r.updatedAt === "number" &&
    Number.isFinite(r.updatedAt) &&
    (r.messageType === "text" || r.messageType === "whatsapp") &&
    typeof r.originalMessage === "string" &&
    typeof r.aiGeneratedMessage === "string" &&
    (r.editedMessage === undefined || typeof r.editedMessage === "string") &&
    typeof r.abbreviationRan === "boolean" &&
    (r.abbreviatedMessage === undefined || typeof r.abbreviatedMessage === "string") &&
    typeof r.finalMessage === "string"
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
 *  silently dropped, the rest kept). Always returns newest-touched-first. */
function readEnvelope(): MessageHistoryRecord[] {
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
    candidateRecords = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).records)) {
    candidateRecords = (parsed as any).records;
  } else {
    return [];
  }

  const valid = candidateRecords.filter(isValidRecord);
  valid.sort((a, b) => b.updatedAt - a.updatedAt);
  return valid;
}

function writeEnvelope(records: MessageHistoryRecord[]): void {
  if (!storageAvailable()) return;
  const envelope: StoredEnvelope = { version: CURRENT_VERSION, records };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Quota exceeded, storage disabled (e.g. Safari private browsing), or
    // any other write failure — degrade gracefully. The in-memory record
    // the caller has is still returned to them; it just won't persist.
  }
}

function genId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `mh_${Date.now().toString(36)}_${rand}`;
}

/** newest-touched-first (updatedAt desc), evicting the LEAST recently
 *  touched record(s) once past the 50 cap — a "Save as New" or an "Update
 *  Existing" that bumps a record to #1 keeps it safe from eviction the same
 *  way; only a record nobody has revisited eventually falls off the end. */
function capToLimit(records: MessageHistoryRecord[]): MessageHistoryRecord[] {
  if (records.length <= MESSAGE_HISTORY_LIMIT) return records;
  return records.slice(0, MESSAGE_HISTORY_LIMIT);
}

/** Resolves "what the user actually finalized" — the latest edited text at
 *  whichever pipeline stage the workflow had reached, never a stale AI/
 *  engine result the user has since edited past. */
function resolveFinalMessage(p: PipelineSnapshot): string {
  return p.finalEdited ?? p.aiEditedDraft ?? p.aiFinal;
}

function buildPipelineFields(
  p: PipelineSnapshot,
): Pick<
  MessageHistoryRecord,
  "messageType" | "originalMessage" | "aiGeneratedMessage" | "editedMessage" | "abbreviationRan" | "abbreviatedMessage" | "finalMessage"
> {
  const finalMessage = resolveFinalMessage(p);
  const editedMessage = p.aiEditedDraft != null && p.aiEditedDraft !== p.aiFinal ? p.aiEditedDraft : undefined;
  const abbreviationRan = p.jssdmGenerated != null;
  const abbreviatedMessage = abbreviationRan && p.jssdmGenerated !== finalMessage ? p.jssdmGenerated! : undefined;
  return {
    messageType: p.messageType,
    originalMessage: p.original,
    aiGeneratedMessage: p.aiFinal,
    editedMessage,
    abbreviationRan,
    abbreviatedMessage,
    finalMessage,
  };
}

/** Reconstructs the five AssistantState pipeline fields from a stored
 *  record, for "Open / Edit" — the inverse of buildPipelineFields. Highlight
 *  spans are not persisted (a transient display artifact of the last live
 *  engine run, regenerable via Re-abbreviate) so they come back empty. */
export function pipelineFromRecord(r: MessageHistoryRecord): {
  outputMode: OutputMode;
  original: string;
  aiFinal: string;
  aiEditedDraft: string;
  jssdmGenerated: string | null;
  finalEdited: string | null;
} {
  return {
    outputMode: r.messageType,
    original: r.originalMessage,
    aiFinal: r.aiGeneratedMessage,
    aiEditedDraft: r.editedMessage ?? r.aiGeneratedMessage,
    jssdmGenerated: r.abbreviationRan ? (r.abbreviatedMessage ?? r.finalMessage) : null,
    finalEdited: r.abbreviationRan ? r.finalMessage : null,
  };
}

/** Newest-touched-first list of every stored record. */
export function getAllMessageHistory(): MessageHistoryRecord[] {
  return readEnvelope();
}

export function getMessageHistoryRecord(id: string): MessageHistoryRecord | null {
  return readEnvelope().find((r) => r.id === id) || null;
}

/** Case-insensitive substring search across every message-text field a
 *  record can carry (original/AI-generated/edited/abbreviated/final) —
 *  Part 1's "history search must cover original, final, AI-generated, and
 *  abbreviated message text." Pass an explicit `records` list to search
 *  within an already-filtered set; omit to search the full stored history.
 *  This is a wholly separate index from jssdm/search.ts's dictionary search
 *  — it never touches that module or its results. */
export function searchMessageHistory(query: string, records?: MessageHistoryRecord[]): MessageHistoryRecord[] {
  const list = records ?? readEnvelope();
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (r) =>
      r.originalMessage.toLowerCase().includes(q) ||
      r.aiGeneratedMessage.toLowerCase().includes(q) ||
      (r.editedMessage ?? "").toLowerCase().includes(q) ||
      (r.abbreviatedMessage ?? "").toLowerCase().includes(q) ||
      r.finalMessage.toLowerCase().includes(q),
  );
}

/** "Save as New" — ALWAYS creates a distinct record, evicting the least
 *  recently touched existing record if this pushes the store past the
 *  50-record cap (FIFO per Part 1's #51 test). */
export function addNewMessageHistoryRecord(snapshot: PipelineSnapshot): MessageHistoryRecord {
  const records = readEnvelope();
  const now = Date.now();
  const created: MessageHistoryRecord = { id: genId(), createdAt: now, updatedAt: now, ...buildPipelineFields(snapshot) };
  writeEnvelope(capToLimit([created, ...records]));
  return created;
}

/** "Update Existing" — modifies the SAME record's fields in place (createdAt
 *  is preserved; updatedAt is refreshed, moving it back to the top of the
 *  newest-touched-first list). Returns null if the record no longer exists
 *  (e.g. deleted, or history cleared, since it was loaded) — the caller
 *  must not silently fall back to creating a new one on this path, since
 *  that would violate "Update Existing must update the same record." */
export function updateMessageHistoryRecord(id: string, snapshot: PipelineSnapshot): MessageHistoryRecord | null {
  const records = readEnvelope();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: MessageHistoryRecord = {
    ...records[idx],
    ...buildPipelineFields(snapshot),
    updatedAt: Date.now(),
  };
  const rest = records.filter((_, i) => i !== idx);
  writeEnvelope([updated, ...rest]);
  return updated;
}

export function deleteMessageHistoryRecord(id: string): void {
  writeEnvelope(readEnvelope().filter((r) => r.id !== id));
}

export function clearMessageHistory(): void {
  writeEnvelope([]);
}
