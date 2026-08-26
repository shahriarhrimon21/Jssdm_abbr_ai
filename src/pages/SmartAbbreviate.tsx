import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { SmartAbbreviateAction, SmartAbbreviateState } from "../smartAbbreviate/state.ts";
import { validateSuggestion } from "../jssdm/suggestionValidation.ts";
import { runAbbreviate } from "../jssdm/abbreviationEngine.ts";
import { callAI } from "../ai/client.ts";
import { selectRelevantEntries, buildSuggestionSystemPrompt, parseSuggestionResponse } from "../ai/suggestionPrompt.ts";
import { recordCopy, addNewHistoryRecord, updateHistoryRecord } from "../smartAbbreviate/history.ts";
import ForceSelect from "../components/ForceSelect.tsx";
import type { ViewId } from "../nav.ts";

const ORIGINAL_DEBOUNCE_MS = 700;
const FINAL_VALIDATE_DEBOUNCE_MS = 400;

function isOnlineNow(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/**
 * State/dispatch are lifted to App.tsx (same reason as the AI Writing
 * Assistant — see src/ai/state.ts's header comment) so an in-progress
 * message, its suggestions, and any hand-edits survive navigating to
 * another feature and back rather than being lost on unmount.
 *
 * This component owns everything the pure reducer deliberately doesn't:
 * the debounce timers, the AbortController-based request cancellation, the
 * online/offline listener, and the actual AI/engine/clipboard/history calls.
 * Every one of those async results is funneled back through the reducer's
 * existing actions — this file makes decisions about WHEN to call
 * GENERATE_START/SUCCESS/ERROR, never decides on its own whether a result
 * is valid (that's suggestionValidation.ts, always, via the reducer).
 */
export default function SmartAbbreviate({
  force,
  setForce,
  state,
  dispatch,
  setView,
}: {
  force: string;
  setForce: (f: string) => void;
  state: SmartAbbreviateState;
  dispatch: Dispatch<SmartAbbreviateAction>;
  setView: (v: ViewId) => void;
}) {
  const [postCopyPrompt, setPostCopyPrompt] = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const originalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalValidateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceRef = useRef(force);
  forceRef.current = force;

  // Online/offline detection — real connectivity events, not a poll. The
  // browser's "online" event is optimistic (it only means "the network
  // interface came back", not "the AI endpoint is reachable"), but it's
  // exactly what lets us stop attempting AI calls the instant the OS/browser
  // reports we're offline, which is the concrete requirement here.
  useEffect(() => {
    function update() {
      dispatch({ type: "SET_ONLINE", online: isOnlineNow() });
    }
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [dispatch]);

  const runGeneration = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const seq = ++requestSeqRef.current;
      abortRef.current?.abort();
      dispatch({ type: "GENERATE_START", requestId: seq });

      if (!isOnlineNow()) {
        // §37/§40: never attempt an AI call while offline. The deterministic
        // engine's own output is guaranteed valid by construction, so the
        // workspace still gets a usable result instead of being stuck empty.
        const engineOut = runAbbreviate(text, forceRef.current).output;
        dispatch({
          type: "GENERATE_SUCCESS",
          requestId: seq,
          original: text,
          rawSuggestions: [engineOut],
          source: "engine",
          force: forceRef.current,
          degradedNotice: "You're offline — AI suggestions are unavailable. Showing the JSSDM engine's own result instead.",
        });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const relevant = selectRelevantEntries(text);
      const systemPrompt = buildSuggestionSystemPrompt(relevant);
      const result = await callAI({
        systemPrompt,
        messages: [{ role: "user", content: text }],
        signal: controller.signal,
      });

      if (result.aborted) return; // Stop/Cancel already dispatched GENERATE_CANCEL

      if (!result.ok || !result.text) {
        const engineOut = runAbbreviate(text, forceRef.current).output;
        dispatch({
          type: "GENERATE_SUCCESS",
          requestId: seq,
          original: text,
          rawSuggestions: [engineOut],
          source: "engine",
          force: forceRef.current,
          degradedNotice: `The AI request failed (${result.error || "unknown error"}). Showing the JSSDM engine's own result instead.`,
        });
        return;
      }

      const parsed = parseSuggestionResponse(result.text);
      if (parsed.suggestions.length === 0) {
        const engineOut = runAbbreviate(text, forceRef.current).output;
        dispatch({
          type: "GENERATE_SUCCESS",
          requestId: seq,
          original: text,
          rawSuggestions: [engineOut],
          source: "engine",
          force: forceRef.current,
          degradedNotice: `The AI's response could not be used (${parsed.parseError || "empty result"}). Showing the JSSDM engine's own result instead.`,
        });
        return;
      }

      dispatch({
        type: "GENERATE_SUCCESS",
        requestId: seq,
        original: text,
        rawSuggestions: parsed.suggestions,
        source: "ai",
        force: forceRef.current,
      });
    },
    [dispatch],
  );

  function stopGeneration() {
    abortRef.current?.abort();
    if (state.pendingRequestId !== null) {
      dispatch({ type: "GENERATE_CANCEL", requestId: state.pendingRequestId });
    }
  }

  // Debounced auto-regeneration when the original message changes — a
  // fresh, non-empty edit restarts the timer; an edit back to empty is
  // handled synchronously by the reducer itself (SET_ORIGINAL) and never
  // reaches this effect's timer. The mount guard below skips the very first
  // run: since state is lifted to App.tsx (so work survives navigating
  // away), simply (re)mounting this page with text already in progress —
  // from a previous visit, or from History's "Re-edit" — must not itself
  // trigger a fresh AI call; only an actual edit after that should.
  const mountedOnceRef = useRef(false);
  useEffect(() => {
    if (!mountedOnceRef.current) {
      mountedOnceRef.current = true;
      return;
    }
    if (originalDebounceRef.current) clearTimeout(originalDebounceRef.current);
    if (!state.originalInput.trim()) return;
    originalDebounceRef.current = setTimeout(() => {
      runGeneration(state.originalInput);
    }, ORIGINAL_DEBOUNCE_MS);
    return () => {
      if (originalDebounceRef.current) clearTimeout(originalDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.originalInput]);

  function setOriginal(text: string) {
    dispatch({ type: "SET_ORIGINAL", text });
  }

  function setFinalEdited(text: string) {
    dispatch({ type: "SET_FINAL_EDITED", text });
    if (finalValidateDebounceRef.current) clearTimeout(finalValidateDebounceRef.current);
    finalValidateDebounceRef.current = setTimeout(() => {
      const validation = validateSuggestion(state.originalInput, text, force);
      dispatch({ type: "VALIDATE_FINAL_RESULT", forText: text, validation });
    }, FINAL_VALIDATE_DEBOUNCE_MS);
  }

  useEffect(
    () => () => {
      if (finalValidateDebounceRef.current) clearTimeout(finalValidateDebounceRef.current);
    },
    [],
  );

  async function doCopy() {
    if (!state.finalValidation?.valid) return;
    setClipboardError(null);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API not available");
      await navigator.clipboard.writeText(state.finalResult);
    } catch {
      setClipboardError("Could not copy to the clipboard. You can select and copy the text manually below.");
      return;
    }

    const selected = state.suggestions.find((s) => s.id === state.selectedSuggestionId);
    const selectedText = selected?.text ?? state.finalResult;

    let recordId: string;
    if (state.loadedHistoryRecordId) {
      const updated = updateHistoryRecord(state.loadedHistoryRecordId, {
        original: state.originalInput,
        selectedSuggestion: selectedText,
        finalResult: state.finalResult,
      });
      recordId = updated?.id ?? state.loadedHistoryRecordId;
    } else {
      const rec = recordCopy(state.originalInput, selectedText, state.finalResult);
      recordId = rec.id;
    }

    dispatch({ type: "COPY_SUCCESS", recordId });
    setCopiedFlash(true);
    setTimeout(() => setCopiedFlash(false), 1500);
    setPostCopyPrompt(true);
  }

  async function doCopySaveAsNew() {
    if (!state.finalValidation?.valid) return;
    setClipboardError(null);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API not available");
      await navigator.clipboard.writeText(state.finalResult);
    } catch {
      setClipboardError("Could not copy to the clipboard. You can select and copy the text manually below.");
      return;
    }
    const selected = state.suggestions.find((s) => s.id === state.selectedSuggestionId);
    const selectedText = selected?.text ?? state.finalResult;
    const rec = addNewHistoryRecord(state.originalInput, selectedText, state.finalResult);
    dispatch({ type: "COPY_SUCCESS", recordId: rec.id });
    setCopiedFlash(true);
    setTimeout(() => setCopiedFlash(false), 1500);
    setPostCopyPrompt(true);
  }

  function startNewMessage() {
    setPostCopyPrompt(false);
    dispatch({ type: "REQUEST_NEW_MESSAGE" });
  }

  const pending = state.pendingConfirmation;

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>Smart Abbreviate</h2>
          <div className="view-sub">
            AI-assisted JSSDM abbreviation with 2-3 ranked suggestions, automatic compliance/information-preservation checks, and a full offline
            fallback — every suggestion shown here has already passed the same validation the JSSDM engine itself is held to.
          </div>
        </div>
        <div className="btnrow">
          <button className="btn secondary small" onClick={() => setView("smartHistory")}>
            History
          </button>
        </div>
      </div>

      {!state.online && (
        <div className="disclaimer">AI features are unavailable while offline. Everything else — editing, validation, copy, and history — still works.</div>
      )}

      <div className="panel">
        <div className="field-row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="flabel" htmlFor="smart-original">
              Original message
            </label>
            <textarea
              id="smart-original"
              value={state.originalInput}
              onChange={(e) => setOriginal(e.target.value)}
              placeholder="Type or paste the message to convert — one message at a time."
            />
          </div>
          <ForceSelect value={force} onChange={setForce} />
        </div>
        <div className="btnrow">
          {state.status === "loading" && (
            <>
              <span className="copyok" style={{ color: "var(--muted)" }}>
                Generating suggestions…
              </span>
              <button className="btn secondary small" onClick={stopGeneration}>
                Stop
              </button>
            </>
          )}
          {state.status !== "loading" && state.originalInput.trim() && (
            <button className="btn secondary small" onClick={() => runGeneration(state.originalInput)}>
              {state.suggestions.length > 0 ? "Regenerate" : "Generate"}
            </button>
          )}
          <button className="btn secondary small" onClick={startNewMessage}>
            New Message
          </button>
        </div>

        {state.error && (
          <div className="result-block bad" style={{ marginTop: 10 }}>
            {state.error}{" "}
            <button className="btn secondary small" style={{ marginLeft: 8 }} onClick={() => runGeneration(state.originalInput)}>
              Retry
            </button>
          </div>
        )}
        {!state.error && state.notice && (
          <div className="result-block warn" style={{ marginTop: 10 }}>
            {state.notice}
          </div>
        )}
      </div>

      {pending && (
        <div className="panel" style={{ borderColor: "var(--warn)" }}>
          {pending.kind === "apply-regeneration" && (
            <>
              <strong>A new set of suggestions is ready, but your current result has unsaved edits.</strong>
              <div className="view-sub" style={{ margin: "6px 0 10px" }}>
                Applying the new suggestions will replace your edited text. Your edits are still safe until you choose.
              </div>
            </>
          )}
          {pending.kind === "switch-suggestion" && (
            <>
              <strong>Switch suggestion?</strong>
              <div className="view-sub" style={{ margin: "6px 0 10px" }}>
                Your current result has unsaved edits — switching will replace it with the other suggestion's text.
              </div>
            </>
          )}
          {pending.kind === "new-message" && (
            <>
              <strong>You have unsaved changes. Start a new message?</strong>
              <div className="view-sub" style={{ margin: "6px 0 10px" }}>
                This will clear the current original message and result. Your saved history is never affected.
              </div>
            </>
          )}
          <div className="btnrow">
            <button className="btn small" onClick={() => dispatch({ type: "CONFIRM_PENDING_ACTION" })}>
              Continue
            </button>
            <button className="btn secondary small" onClick={() => dispatch({ type: "CANCEL_PENDING_ACTION" })}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.suggestions.length > 0 && (
        <div className="panel">
          <h3>Suggestions</h3>
          <div className="smart-suggestion-list">
            {state.suggestions.map((s, i) => {
              const isSelected = s.id === state.selectedSuggestionId;
              return (
                <div key={s.id} className={"smart-suggestion-card" + (isSelected ? " selected" : "")}>
                  <div className="smart-suggestion-head">
                    <span className={"badge " + (s.validation.valid ? "badge-ok" : "badge-bad")}>{s.validation.valid ? "Valid" : "Invalid"}</span>
                    <span className="view-sub" style={{ margin: 0 }}>
                      {s.source === "engine" ? "JSSDM engine" : s.source === "history" ? "From history" : `AI candidate ${i + 1}`}
                    </span>
                    {isSelected && <span className="badge badge-rule">Selected</span>}
                  </div>
                  <textarea
                    aria-label={`Suggestion ${i + 1} text (editable)`}
                    value={s.text}
                    onChange={(e) => dispatch({ type: "EDIT_SUGGESTION", id: s.id, text: e.target.value })}
                    style={{ marginTop: 8 }}
                  />
                  {s.correctionNote && <div className="view-sub" style={{ marginTop: 6 }}>Auto-corrected: {s.correctionNote}</div>}
                  {!s.validation.valid && (
                    <ul className="smart-issue-list">
                      {s.validation.complianceIssues.map((iss, ix) => (
                        <li key={`c${ix}`}>{iss.message}</li>
                      ))}
                      {s.validation.preservationIssues
                        .filter((iss) => iss.kind !== "length-drop")
                        .map((iss, ix) => (
                          <li key={`p${ix}`}>{iss.message}</li>
                        ))}
                    </ul>
                  )}
                  <div className="btnrow" style={{ marginTop: 8 }}>
                    {!isSelected && (
                      <button className="btn secondary small" onClick={() => dispatch({ type: "SELECT_SUGGESTION", id: s.id })}>
                        Use this suggestion
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {state.selectedSuggestionId && (
        <div className="panel">
          <h3>Final Result</h3>
          <textarea
            id="smart-final"
            aria-label="Final result (editable — this is what Copy copies)"
            value={state.finalResult}
            onChange={(e) => setFinalEdited(e.target.value)}
          />
          <div className="btnrow" style={{ marginTop: 8 }}>
            <span className={"badge " + (state.finalValidation?.valid ? "badge-ok" : "badge-bad")}>
              {state.finalValidation?.valid ? "Valid — ready to copy" : "Invalid — fix before copying"}
            </span>
          </div>
          {state.finalValidation && !state.finalValidation.valid && (
            <ul className="smart-issue-list">
              {state.finalValidation.complianceIssues.map((iss, ix) => (
                <li key={`fc${ix}`}>{iss.message}</li>
              ))}
              {state.finalValidation.preservationIssues
                .filter((iss) => iss.kind !== "length-drop")
                .map((iss, ix) => (
                  <li key={`fp${ix}`}>{iss.message}</li>
                ))}
            </ul>
          )}

          <div className="btnrow" style={{ marginTop: 10 }}>
            {state.loadedHistoryRecordId ? (
              <>
                <button className="btn small" onClick={doCopy} disabled={!state.finalValidation?.valid}>
                  Copy &amp; Update Existing
                </button>
                <button className="btn secondary small" onClick={doCopySaveAsNew} disabled={!state.finalValidation?.valid}>
                  Copy &amp; Save as New
                </button>
              </>
            ) : (
              <button className="btn small" onClick={doCopy} disabled={!state.finalValidation?.valid}>
                Copy
              </button>
            )}
            {copiedFlash && <span className="copyok">Copied.</span>}
          </div>
          {clipboardError && (
            <div className="result-block bad" style={{ marginTop: 10 }}>
              {clipboardError}
            </div>
          )}

          {postCopyPrompt && (
            <div className="result-block ok" style={{ marginTop: 10 }}>
              Saved to history. Start a new message?
              <div className="btnrow" style={{ marginTop: 8 }}>
                <button className="btn small" onClick={startNewMessage}>
                  Yes, new message
                </button>
                <button className="btn secondary small" onClick={() => setPostCopyPrompt(false)}>
                  No, keep this
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {state.status === "idle" && !state.originalInput.trim() && (
        <div className="empty">Type or paste a message above to get started.</div>
      )}
    </div>
  );
}
