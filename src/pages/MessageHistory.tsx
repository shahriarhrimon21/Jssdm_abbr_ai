import { useState } from "react";
import type { Dispatch } from "react";
import type { AssistantAction } from "../ai/state.ts";
import {
  getAllMessageHistory,
  searchMessageHistory,
  deleteMessageHistoryRecord,
  clearMessageHistory,
  pipelineFromRecord,
  MESSAGE_HISTORY_LIMIT,
  type MessageHistoryRecord,
} from "../ai/messageHistory.ts";
import type { ViewId } from "../nav.ts";

/**
 * The dedicated "last 50 message history" page (Phase 1.5 Part 1) — distinct
 * from Favorites & Recent (JSSDM dictionary lookups) and from the AI Writing
 * Assistant's own in-session chat log. Fully offline: every function this
 * page calls is synchronous localStorage access, no network call anywhere.
 */
export default function MessageHistory({
  dispatch,
  setView,
}: {
  dispatch: Dispatch<AssistantAction>;
  setView: (v: ViewId) => void;
}) {
  const [query, setQuery] = useState("");
  const [, forceRerender] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function refresh() {
    forceRerender((n) => n + 1);
  }

  const all = getAllMessageHistory();
  const shown = searchMessageHistory(query, all);

  // "Open / Edit" — loads the record's full pipeline into the AI Writing
  // Assistant session and marks it as the currently-loaded record, so a
  // subsequent save there defaults to Update Existing rather than creating
  // a duplicate (see ai/state.ts's LOAD_HISTORY_RECORD).
  function openRecord(record: MessageHistoryRecord) {
    const p = pipelineFromRecord(record);
    dispatch({ type: "LOAD_HISTORY_RECORD", recordId: record.id, ...p });
    setView("ai");
  }

  async function copyRecord(record: MessageHistoryRecord) {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(record.finalMessage);
    } catch {
      // Best-effort — the record itself is unaffected even if the clipboard
      // write fails (e.g. permission denied in this browser).
    }
    setCopiedId(record.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function removeRecord(id: string) {
    deleteMessageHistoryRecord(id);
    setConfirmDeleteId(null);
    refresh();
  }

  function doClearAll() {
    clearMessageHistory();
    setConfirmClear(false);
    refresh();
  }

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Message History</h2>
          <div className="view-sub">
            The last {MESSAGE_HISTORY_LIMIT} saved messages from AI Writing Assistant — stored only in your browser, never sent anywhere, and fully
            usable offline. Separate from Favorites &amp; Recent (JSSDM dictionary lookups).
          </div>
        </div>
        <div className="btnrow">
          <button className="btn secondary small" onClick={() => setView("ai")}>
            Back to AI Writing Assistant
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="field-row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="flabel" htmlFor="message-history-search">
              Search (original, AI, edited, abbreviated, or final message text)
            </label>
            <input
              id="message-history-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history..."
            />
          </div>
        </div>
        <div className="btnrow">
          <span className="view-sub" style={{ margin: 0 }}>
            {shown.length} of {all.length} record{all.length === 1 ? "" : "s"}
          </span>
          {all.length > 0 && !confirmClear && (
            <button className="btn secondary small" onClick={() => setConfirmClear(true)}>
              Clear all
            </button>
          )}
          {confirmClear && (
            <span
              role="alertdialog"
              aria-label="Confirm clear all"
              className="fade-in"
              style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setConfirmClear(false);
              }}
            >
              <span className="view-sub" style={{ margin: 0 }}>
                Delete all {all.length} records? This cannot be undone.
              </span>
              <button className="btn small" onClick={doClearAll}>
                Confirm clear all
              </button>
              <button className="btn secondary small" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </span>
          )}
        </div>
      </div>

      {shown.length === 0 && (
        <div className="empty">{all.length === 0 ? "No history yet — save a message from AI Writing Assistant to see it here." : "No matching history found."}</div>
      )}

      {shown.map((r) => (
        <div className="panel fade-in" key={r.id}>
          <div className="view-sub" style={{ marginBottom: 6 }}>
            {new Date(r.updatedAt).toLocaleString()} · {r.messageType === "whatsapp" ? "WhatsApp" : "Text"}
            {r.abbreviationRan ? " · abbreviated" : ""}
          </div>

          <div className="text-state-col">
            <h4>Original</h4>
          </div>
          <div className="text-block" style={{ marginBottom: 10 }}>
            {r.originalMessage}
          </div>

          <div className="text-state-col">
            <h4>Final message</h4>
          </div>
          <div className="text-block" style={{ marginBottom: 10 }}>
            {r.finalMessage}
          </div>

          <div className="btnrow">
            <button className="btn small" onClick={() => copyRecord(r)}>
              Copy
            </button>
            {copiedId === r.id && <span className="copyok">Copied.</span>}
            <button className="btn secondary small" onClick={() => openRecord(r)}>
              Open / Edit
            </button>
            {confirmDeleteId !== r.id && (
              <button className="btn secondary small" onClick={() => setConfirmDeleteId(r.id)}>
                Delete
              </button>
            )}
            {confirmDeleteId === r.id && (
              <>
                <span className="view-sub" style={{ margin: 0 }}>
                  Delete this record?
                </span>
                <button className="btn small" onClick={() => removeRecord(r.id)}>
                  Confirm delete
                </button>
                <button className="btn secondary small" onClick={() => setConfirmDeleteId(null)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
