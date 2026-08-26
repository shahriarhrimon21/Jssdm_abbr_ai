import { useState } from "react";
import type { Dispatch } from "react";
import type { SmartAbbreviateAction } from "../smartAbbreviate/state.ts";
import { getAllHistory, searchHistory, deleteHistoryRecord, clearHistory, recordCopy, HISTORY_LIMIT, type HistoryRecord } from "../smartAbbreviate/history.ts";
import type { ViewId } from "../nav.ts";

/**
 * Fully offline: every function this page calls (getAllHistory,
 * searchHistory, deleteHistoryRecord, clearHistory, recordCopy) is
 * synchronous localStorage access — no network call anywhere here, which is
 * what keeps history usable with no internet connection.
 */
export default function SmartHistory({
  force,
  dispatch,
  setView,
}: {
  force: string;
  dispatch: Dispatch<SmartAbbreviateAction>;
  setView: (v: ViewId) => void;
}) {
  const [query, setQuery] = useState("");
  const [, forceRerender] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function refresh() {
    forceRerender((n) => n + 1);
  }

  const all = getAllHistory();
  const shown = searchHistory(query, all);

  function reEdit(record: HistoryRecord) {
    dispatch({
      type: "LOAD_FROM_HISTORY",
      original: record.original,
      selectedSuggestionText: record.selectedSuggestion,
      finalResult: record.finalResult,
      recordId: record.id,
      force,
    });
    setView("smartAbbreviate");
  }

  async function copyRecord(record: HistoryRecord) {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(record.finalResult);
    } catch {
      // Best-effort — the record is still valid stored history even if the
      // clipboard write fails (e.g. permission denied in this browser).
    }
    // Re-copying an existing record's unchanged content is exactly the
    // "avoid duplicate records" case recordCopy() already handles — it
    // moves this record to the top and refreshes its timestamp rather than
    // creating a duplicate.
    recordCopy(record.original, record.selectedSuggestion, record.finalResult);
    setCopiedId(record.id);
    setTimeout(() => setCopiedId(null), 1500);
    refresh();
  }

  function removeRecord(id: string) {
    deleteHistoryRecord(id);
    refresh();
  }

  function doClearAll() {
    clearHistory();
    setConfirmClear(false);
    refresh();
  }

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Smart History</h2>
          <div className="view-sub">
            Last {HISTORY_LIMIT} copied results, stored only in your browser — never sent anywhere, and fully usable offline.
          </div>
        </div>
        <div className="btnrow">
          <button className="btn secondary small" onClick={() => setView("smartAbbreviate")}>
            Back to Smart Abbreviate
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="field-row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="flabel" htmlFor="smart-history-search">
              Search (original message, final result, or selected suggestion)
            </label>
            <input
              id="smart-history-search"
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
        <div className="empty">{all.length === 0 ? "No history yet — copied results will appear here." : "No matching history found."}</div>
      )}

      {shown.map((r) => (
        <div className="panel fade-in" key={r.id}>
          <div className="view-sub" style={{ marginBottom: 6 }}>
            {new Date(r.timestamp).toLocaleString()}
          </div>
          <div className="text-state-col">
            <h4>Original</h4>
          </div>
          <div className="text-block" style={{ marginBottom: 10 }}>
            {r.original}
          </div>
          <div className="text-state-col">
            <h4>Final result</h4>
          </div>
          <div className="text-block" style={{ marginBottom: 10 }}>
            {r.finalResult}
          </div>
          <div className="btnrow">
            <button className="btn small" onClick={() => copyRecord(r)}>
              Copy
            </button>
            {copiedId === r.id && <span className="copyok">Copied.</span>}
            <button className="btn secondary small" onClick={() => reEdit(r)}>
              Re-edit
            </button>
            <button className="btn secondary small" onClick={() => removeRecord(r.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
