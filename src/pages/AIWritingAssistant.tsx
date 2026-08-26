import { useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { AssistantAction, AssistantState } from "../ai/state.ts";
import { buildSystemPrompt, TONES } from "../ai/prompts.ts";
import { callAI, type ChatMessage } from "../ai/client.ts";
import { runAbbreviate } from "../jssdm/abbreviationEngine.ts";
import { runDeabbreviate } from "../jssdm/deabbreviationEngine.ts";
import HighlightedText from "../components/HighlightedText.tsx";
import Icon from "../components/Icon.tsx";
import Tooltip from "../components/Tooltip.tsx";
import { useOnlineStatus } from "../hooks/useOnlineStatus.ts";
import { addNewMessageHistoryRecord, updateMessageHistoryRecord, type PipelineSnapshot } from "../ai/messageHistory.ts";
import type { ViewId } from "../nav.ts";

// §B10/B13: a hung network request must not leave the UI stuck in
// "Working..." forever, and a fast-changing user (new request fired before
// an older one resolves) must never let the older, now-stale response land
// on top of a newer one — request-id sequencing plus an AbortController
// guard against both.
const REQUEST_TIMEOUT_MS = 30000;

const LS_PROVIDER = "jssdm_ai_provider_v1";
const PROVIDERS = [
  { id: "groq", label: "Groq (free, no card)" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI" },
];
function loadStoredProvider(): string {
  try {
    return localStorage.getItem(LS_PROVIDER) || "groq";
  } catch {
    return "groq";
  }
}
function storeProvider(id: string): void {
  try {
    localStorage.setItem(LS_PROVIDER, id);
  } catch {
    /* best-effort only */
  }
}

/** One line of preview for a collapsed reference stage. */
function peek(text: string | null): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 96 ? flat.slice(0, 96) + "…" : flat;
}

/**
 * The five-stage workspace.
 *
 * `state`/`dispatch` are owned by App.tsx (see src/ai/state.ts's top
 * comment for why) — this component reads and dispatches into that shared
 * session rather than holding its own reducer for anything that must
 * survive navigating away. Only genuinely transient UI state (the
 * "Copied." flash, which reference stages are expanded, the provider
 * choice which is separately persisted) stays local.
 *
 * Phase 2 presentation rules applied here, none of which change behaviour:
 *
 *  - Progressive disclosure. Stages appear as they are reached, so a
 *    first-time user sees one input and one button rather than five
 *    panels. The two untouched reference copies — the raw AI response and
 *    the engine's own output — collapse to a summary line, since they are
 *    only needed when something looks wrong.
 *  - Provenance. Editable AI stages carry the cyan AI treatment; engine
 *    stages carry the green verified treatment; each is labelled in words
 *    as well as colour.
 *  - Force is gone from this page. It is global in the top bar now, so a
 *    user cannot set two contradictory values on two screens.
 *
 * Frozen behaviour preserved exactly: editing a box never re-runs the
 * engine; "Send to Abbreviation" always reads the *edited* AI draft, never
 * the raw response; Copy and Save always read the *edited* final text.
 */
export default function AIWritingAssistant({
  force,
  state,
  dispatch,
  setView,
}: {
  force: string;
  setForce?: (f: string) => void;
  state: AssistantState;
  dispatch: Dispatch<AssistantAction>;
  setView?: (v: ViewId) => void;
}) {
  const [copiedAI, setCopiedAI] = useState(false);
  const [copiedFinal, setCopiedFinal] = useState(false);
  const [provider, setProvider] = useState(loadStoredProvider);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showRawAI, setShowRawAI] = useState(false);
  const [showEngine, setShowEngine] = useState(false);
  const online = useOnlineStatus();

  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Remembers exactly which call to re-run for the Retry button — Retry must
  // redo whichever request actually failed (initial, follow-up, or "Send to
  // AI"), not always re-submit the top draft box, which could be stale or
  // empty by the time a later step's request fails.
  const retryRef = useRef<(() => void) | null>(null);

  // A stale error from a previous visit to this page is transient state,
  // not session content — clear it each time the page is (re)mounted,
  // without touching any of the actual drafted text/conversation.
  useEffect(() => {
    if (state.error) dispatch({ type: "CLEAR_ERROR" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abort any in-flight request when this page unmounts (navigating away).
  // requestSeqRef/abortRef are component-local, so without this an
  // abandoned request could still resolve later and, if the user returns to
  // this page and starts a fresh request, land against a freshly-reset
  // sequence counter that happens to match — the exact stale-overwrite bug
  // the sequencing guard exists to prevent in the first place.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeProvider(id: string) {
    setProvider(id);
    storeProvider(id);
  }

  // Shared by every path that actually calls the AI (initial Generate/Check
  // & Polish, a typed follow-up, and "Send to AI →" on the final result).
  // Sets up its own AbortController + timeout + request-id guard each time
  // it runs, so a slow/hung request can never silently overwrite a newer
  // one and never leaves the button stuck showing "Working..." forever.
  async function runAIRequest(userMessage: string, chatContext: ChatMessage[]) {
    retryRef.current = () => runAIRequest(userMessage, chatContext);
    const seq = ++requestSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    dispatch({ type: "REQUEST_START" });
    const systemPrompt = buildSystemPrompt(state.mode, state.tone, state.customTone, state.outputMode, state.signature);
    const result = await callAI({
      provider,
      systemPrompt,
      messages: [...chatContext, { role: "user", content: userMessage }],
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (seq !== requestSeqRef.current) return; // superseded by a newer request — never let a stale response land

    if (result.aborted) {
      if (timedOut) {
        dispatch({ type: "REQUEST_ERROR", error: "The AI request took too long and was stopped. Please try again." });
      }
      // else: the user pressed Stop, which already dispatched REQUEST_CANCEL itself.
      return;
    }
    if (result.ok && result.text) {
      dispatch({ type: "REQUEST_SUCCESS", text: result.text, userMessage });
    } else {
      dispatch({ type: "REQUEST_ERROR", error: result.error || "The AI request failed." });
    }
  }

  function stopAIRequest() {
    abortRef.current?.abort();
    dispatch({ type: "REQUEST_CANCEL" });
  }

  function runInitial() {
    if (!state.draftInput.trim()) return;
    const text = state.draftInput;
    dispatch({ type: "SET_ORIGINAL", text });
    runAIRequest(text, []);
  }

  function runFollowup() {
    if (!state.followupInput.trim() || !state.aiFinal) return;
    const msg = state.followupInput;
    dispatch({ type: "SET_FOLLOWUP_INPUT", text: "" });
    runAIRequest(msg, state.chat);
  }

  // Explicit action: send the CURRENT edited AI draft — not the original,
  // unedited AI response — into the deterministic JSSDM engine.
  function sendToAbbreviation() {
    if (!state.aiEditedDraft) return;
    const r = runAbbreviate(state.aiEditedDraft, force);
    dispatch({ type: "JSSDM_GENERATED", text: r.output, spans: r.outSpans });
  }

  // Explicit action: re-run Abbreviate on whatever is CURRENTLY in the final
  // editable box (which may include words the user typed in by hand after
  // the last engine run) — never triggered automatically by typing.
  function reabbreviate() {
    if (!state.finalEdited) return;
    const r = runAbbreviate(state.finalEdited, force);
    dispatch({ type: "JSSDM_GENERATED", text: r.output, spans: r.outSpans });
  }

  // Same idea, the reverse direction.
  function deabbreviateFinal() {
    if (!state.finalEdited) return;
    const r = runDeabbreviate(state.finalEdited, force);
    dispatch({ type: "JSSDM_GENERATED", text: r.output, spans: r.outSpans });
  }

  // Sends the current final-edited text to the AI as a follow-up turn in the
  // existing conversation, without discarding anything already in this
  // session.
  function sendFinalToAI() {
    if (!state.finalEdited) return;
    runAIRequest(state.finalEdited, state.chat);
  }

  function copy(text: string, setter: (v: boolean) => void) {
    navigator.clipboard?.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 1500);
    });
  }

  // "Save to History" always saves what the user has actually finalized
  // right now — messageHistory.ts's buildPipelineFields resolves
  // finalMessage as finalEdited ?? aiEditedDraft ?? aiFinal, so a save here
  // can never capture a stale AI/engine result the user has since edited
  // past, regardless of which pipeline stage they've reached.
  function currentSnapshot(): PipelineSnapshot | null {
    if (!state.aiFinal) return null;
    return {
      messageType: state.outputMode,
      original: state.original,
      aiFinal: state.aiFinal,
      aiEditedDraft: state.aiEditedDraft,
      jssdmGenerated: state.jssdmGenerated,
      finalEdited: state.finalEdited,
    };
  }

  function saveAsNew() {
    const snapshot = currentSnapshot();
    if (!snapshot) return;
    const record = addNewMessageHistoryRecord(snapshot);
    dispatch({ type: "SET_LOADED_HISTORY_RECORD_ID", recordId: record.id });
    setSaveNote("Saved as a new history record.");
    setTimeout(() => setSaveNote(null), 2000);
  }

  function updateExisting() {
    const snapshot = currentSnapshot();
    if (!snapshot || !state.loadedHistoryRecordId) return;
    const updated = updateMessageHistoryRecord(state.loadedHistoryRecordId, snapshot);
    if (!updated) {
      // The loaded record was deleted (or history was cleared) elsewhere
      // since it was opened — Update Existing must never silently create a
      // substitute record, so this is surfaced instead of papered over.
      dispatch({ type: "SET_LOADED_HISTORY_RECORD_ID", recordId: null });
      setSaveNote("That record no longer exists — use Save as New instead.");
      setTimeout(() => setSaveNote(null), 3000);
      return;
    }
    setSaveNote("History record updated.");
    setTimeout(() => setSaveNote(null), 2000);
  }

  const isWhatsapp = state.outputMode === "whatsapp";
  const hasResult = state.aiFinal !== null;
  const hasEngineRun = state.jssdmGenerated !== null;

  const saveControls = (
    <>
      {state.loadedHistoryRecordId && (
        <Tooltip label="Update the record you opened">
          <button className="btn secondary small" onClick={updateExisting}>
            <Icon name="save" size={15} />
            Update Existing
          </button>
        </Tooltip>
      )}
      <Tooltip label="Keep this as a new record">
        <button className="btn secondary small" onClick={saveAsNew}>
          <Icon name="plus" size={15} />
          Save as New
        </button>
      </Tooltip>
      {saveNote && (
        <span className="copyok">
          <Icon name="check" size={14} />
          {saveNote}
        </span>
      )}
    </>
  );

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>AI Assistant</h2>
          <div className="view-sub">
            StaffAI helps with grammar, clarity and tone. It never decides what counts as an authorised abbreviation — that is settled by the
            JSSDM engine when you send the draft on.
          </div>
        </div>
        {setView && (
          <button className="btn secondary small" onClick={() => setView("messageHistory")}>
            <Icon name="history" size={15} />
            History
          </button>
        )}
      </div>

      <div className="disclaimer">
        <Icon name="info" size={16} />
        <span>
          The AI provider is called through this site's own server function — no API key is ever stored in your browser. Abbreviation
          correctness is decided entirely by the deterministic JSSDM engine, not by the AI.
        </span>
      </div>

      {!online && (
        <div className="notice warn" role="status">
          <Icon name="offline" size={16} />
          <span>
            <strong>You're offline.</strong> Drafting with StaffAI needs a connection. Abbreviation, validation, search and history all still
            work.
          </span>
        </div>
      )}

      {/* ---------------- request panel ---------------- */}
      <div className="panel">
        <div className="toolbar">
          <div className="tool">
            <label className="flabel">Output style</label>
            <div className="seg">
              <button
                className={!isWhatsapp ? "active" : ""}
                onClick={() => dispatch({ type: "SET_OUTPUT_MODE", outputMode: "text" })}
                aria-pressed={!isWhatsapp}
              >
                Text
              </button>
              <button
                className={isWhatsapp ? "active" : ""}
                onClick={() => dispatch({ type: "SET_OUTPUT_MODE", outputMode: "whatsapp" })}
                aria-pressed={isWhatsapp}
              >
                WhatsApp
              </button>
            </div>
          </div>

          <div className="tool">
            <label className="flabel">Operation</label>
            <div className="seg">
              <button
                className={state.mode === "check" ? "active" : ""}
                onClick={() => dispatch({ type: "SET_MODE", mode: "check" })}
                aria-pressed={state.mode === "check"}
              >
                Check &amp; Polish
              </button>
              <button
                className={state.mode === "generate" ? "active" : ""}
                onClick={() => dispatch({ type: "SET_MODE", mode: "generate" })}
                aria-pressed={state.mode === "generate"}
              >
                Generate
              </button>
            </div>
          </div>

          <div className="tool">
            <label className="flabel" htmlFor="ai-provider">
              AI provider
            </label>
            <select id="ai-provider" value={provider} onChange={(e) => changeProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {isWhatsapp && (
            <div className="tool grow">
              <label className="flabel" htmlFor="ai-signature">
                Your signature — optional, never invented
              </label>
              <input
                id="ai-signature"
                type="text"
                placeholder='e.g. "Maj Rahman"'
                value={state.signature}
                onChange={(e) => dispatch({ type: "SET_SIGNATURE", signature: e.target.value })}
              />
            </div>
          )}
        </div>

        <details className="tone-fold">
          <summary>
            Tone <span className="tone-current">{state.tone}</span>
          </summary>
          <div className="tone-row">
            {TONES.map((t) => (
              <button
                key={t}
                className={"chip" + (state.tone === t ? " active" : "")}
                onClick={() => dispatch({ type: "SET_TONE", tone: t })}
                aria-pressed={state.tone === t}
              >
                {t}
              </button>
            ))}
          </div>
          {state.tone === "Custom" && (
            <input
              type="text"
              placeholder="Describe the tone you want..."
              value={state.customTone}
              onChange={(e) => dispatch({ type: "SET_CUSTOM_TONE", customTone: e.target.value })}
              style={{ marginTop: 10 }}
            />
          )}
        </details>

        <label className="flabel" htmlFor="ai-draft">
          {state.mode === "check" ? "Text to check & polish" : "Describe what you want written"}
        </label>
        <textarea
          id="ai-draft"
          value={state.draftInput}
          onChange={(e) => dispatch({ type: "SET_DRAFT_INPUT", text: e.target.value })}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter submits — the standard shortcut for a
            // multi-line field, and it never intercepts a bare Enter,
            // which must still insert a newline.
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runInitial();
          }}
          placeholder={
            state.mode === "check"
              ? "Paste your draft…"
              : isWhatsapp
                ? "e.g. Inform Sir that I have taken move from my present unit and will join the new unit on 02 September."
                : "e.g. A short memo requesting additional troop…"
          }
        />
        <div className="btnrow" style={{ marginTop: 12 }} aria-busy={state.loading}>
          <button className="btn" onClick={runInitial} disabled={state.loading || !state.draftInput.trim()}>
            {state.loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="ai" size={16} />}
            {state.loading ? "StaffAI is working…" : state.mode === "check" ? "Check & Polish" : "Generate"}
          </button>
          {state.loading && (
            <button className="btn secondary small" onClick={stopAIRequest}>
              <Icon name="stop" size={15} />
              Stop
            </button>
          )}
          <span className="kbd-hint hide-mobile">Ctrl + Enter</span>
        </div>

        {state.error && !hasResult && (
          <div className="notice bad fade-in" style={{ marginTop: 12, marginBottom: 0 }} role="alert">
            <Icon name="error" size={16} />
            <span>{state.error}</span>
            <button className="btn secondary small" onClick={() => (retryRef.current ? retryRef.current() : runInitial())}>
              <Icon name="refresh" size={14} />
              Try again
            </button>
          </div>
        )}
      </div>

      {/* ---------------- loading skeleton ---------------- */}
      {state.loading && !hasResult && (
        <div className="panel fade-in" aria-hidden="true">
          <div className="skeleton skeleton-line" style={{ width: "34%", height: 10 }} />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
        </div>
      )}

      {/* ---------------- the pipeline ---------------- */}
      {hasResult && (
        <div className="fade-in">
          {/* stage 1 — original, collapsed reference */}
          {!showOriginal ? (
            <button className="stage-collapsed" onClick={() => setShowOriginal(true)} aria-expanded={false}>
              <Icon name="expand" size={15} />
              <span>Original</span>
              <span className="peek">{peek(state.original)}</span>
            </button>
          ) : (
            <div className="stage">
              <div className="stage-head">
                <h4>Original</h4>
                <span className="stage-note">Exactly what you typed — never altered</span>
                <span className="spacer" />
                <button className="iconbtn" onClick={() => setShowOriginal(false)} aria-label="Collapse original">
                  <Icon name="collapse" size={17} />
                </button>
              </div>
              <div className="stage-body">
                <div className="text-block">{state.original}</div>
              </div>
            </div>
          )}

          {/* stage 2 — raw AI response, collapsed reference */}
          {!showRawAI ? (
            <button className="stage-collapsed" onClick={() => setShowRawAI(true)} aria-expanded={false}>
              <Icon name="expand" size={15} />
              <span>AI response</span>
              <span className="peek">{peek(state.aiFinal)}</span>
            </button>
          ) : (
            <div className="stage is-ai">
              <div className="stage-head">
                <span className="prov prov-ai">
                  <Icon name="ai" size={12} />
                  AI-assisted
                </span>
                <h4>AI response</h4>
                <span className="stage-note">What the model returned, unedited</span>
                <span className="spacer" />
                <button className="iconbtn" onClick={() => setShowRawAI(false)} aria-label="Collapse AI response">
                  <Icon name="collapse" size={17} />
                </button>
              </div>
              <div className="stage-body">
                <div className="text-block">{state.aiFinal}</div>
              </div>
            </div>
          )}

          {/* stage 3 — editable AI draft */}
          <div className="stage is-ai">
            <div className="stage-head">
              <span className="prov prov-ai">
                <Icon name="ai" size={12} />
                AI-assisted draft
              </span>
              <h4>Your draft</h4>
              <span className="stage-note">Edit freely — this is what gets sent to the manual</span>
            </div>
            <div className="stage-body">
              <textarea
                id="ai-edited-draft"
                value={state.aiEditedDraft ?? ""}
                onChange={(e) => dispatch({ type: "SET_AI_EDITED_DRAFT", text: e.target.value })}
                aria-label="Editable AI draft"
              />
            </div>
            <div className="stage-actions">
              <button className="btn gold" onClick={sendToAbbreviation}>
                <Icon name="abbreviate" size={16} />
                Send to Abbreviation
              </button>
              <button className="btn secondary small" onClick={() => copy(state.aiEditedDraft || "", setCopiedAI)}>
                <Icon name={copiedAI ? "check" : "copy"} size={15} />
                {copiedAI ? "Copied" : "Copy"}
              </button>
              {!hasEngineRun && saveControls}
            </div>
          </div>

          {/* stage 4 — engine output, collapsed reference */}
          {hasEngineRun &&
            (!showEngine ? (
              <button className="stage-collapsed" onClick={() => setShowEngine(true)} aria-expanded={false}>
                <Icon name="expand" size={15} />
                <span>Engine output</span>
                <span className="peek">{peek(state.jssdmGenerated)}</span>
              </button>
            ) : (
              <div className="stage is-verified">
                <div className="stage-head">
                  <span className="prov prov-verified">
                    <Icon name="verified" size={12} />
                    JSSDM 2022
                  </span>
                  <h4>Engine output</h4>
                  <span className="stage-note">What the manual produced, with sources</span>
                  <span className="spacer" />
                  <button className="iconbtn" onClick={() => setShowEngine(false)} aria-label="Collapse engine output">
                    <Icon name="collapse" size={17} />
                  </button>
                </div>
                <div className="stage-body">
                  <HighlightedText text={state.jssdmGenerated!} spans={state.jssdmGeneratedSpans} />
                  <p className="hint">
                    Underlined terms are traceable to the manual. Select or tap one to see its source. Terms not in the manual are left
                    unchanged.
                  </p>
                </div>
              </div>
            ))}

          {/* stage 5 — the authoritative final text */}
          {hasEngineRun && (
            <div className="stage is-verified">
              <div className="stage-head">
                <span className="prov prov-verified">
                  <Icon name="verified" size={12} />
                  Checked against JSSDM 2022
                </span>
                <h4>Final message</h4>
                <span className="stage-note">This is what Copy and Save use</span>
              </div>
              <div className="stage-body">
                <textarea
                  id="final-edited"
                  value={state.finalEdited ?? ""}
                  onChange={(e) => dispatch({ type: "SET_FINAL_EDITED", text: e.target.value })}
                  aria-label="Final editable message"
                />
              </div>
              <div className="stage-actions">
                <button className="btn" onClick={() => copy(state.finalEdited || "", setCopiedFinal)}>
                  <Icon name={copiedFinal ? "check" : "copy"} size={16} />
                  {copiedFinal ? "Copied" : "Copy message"}
                </button>
                {saveControls}
                <span className="spacer" />
                <Tooltip label="Run the engine again">
                  <button className="btn ghost small" onClick={reabbreviate}>
                    <Icon name="abbreviate" size={15} />
                    Re-abbreviate
                  </button>
                </Tooltip>
                <Tooltip label="Expand back to full forms">
                  <button className="btn ghost small" onClick={deabbreviateFinal}>
                    <Icon name="deabbreviate" size={15} />
                    De-abbreviate
                  </button>
                </Tooltip>
                <Tooltip label="Ask StaffAI to revise this">
                  <button className="btn ghost small" onClick={sendFinalToAI} disabled={state.loading || !state.finalEdited}>
                    {state.loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="ai" size={15} />}
                    {state.loading ? "Sending…" : "Send to AI"}
                  </button>
                </Tooltip>
                {state.loading && (
                  <button className="btn ghost small" onClick={stopAIRequest}>
                    <Icon name="stop" size={15} />
                    Stop
                  </button>
                )}
              </div>
            </div>
          )}

          {state.error && (
            <div className="notice bad fade-in" role="alert">
              <Icon name="error" size={16} />
              <span>{state.error}</span>
              <button className="btn secondary small" onClick={() => retryRef.current?.()}>
                <Icon name="refresh" size={14} />
                Try again
              </button>
            </div>
          )}

          {/* refine further */}
          <div className="panel">
            <label className="flabel" htmlFor="ai-followup">
              Refine further
            </label>
            <div className="field-row">
              <input
                id="ai-followup"
                type="text"
                style={{ flex: 1, minWidth: 200 }}
                placeholder='e.g. "make it more formal"'
                value={state.followupInput}
                onChange={(e) => dispatch({ type: "SET_FOLLOWUP_INPUT", text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runFollowup();
                }}
              />
              <button className="btn secondary" onClick={runFollowup} disabled={state.loading || !state.followupInput.trim()}>
                {state.loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={15} />}
                {state.loading ? "Sending…" : "Send"}
              </button>
            </div>

            {state.chat.length > 0 && (
              <details className="chat-fold">
                <summary>Conversation ({state.chat.length} turns)</summary>
                <div className="chat-log" role="log" aria-label="Conversation with StaffAI">
                  {state.chat.map((m, i) => (
                    <div key={i} className={`chat-bubble ${m.role}`}>
                      {m.content}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
