import { useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { AssistantAction, AssistantState } from "../ai/state.ts";
import { buildSystemPrompt, TONES } from "../ai/prompts.ts";
import { callAI, type ChatMessage } from "../ai/client.ts";
import { runAbbreviate } from "../jssdm/abbreviationEngine.ts";
import { runDeabbreviate } from "../jssdm/deabbreviationEngine.ts";
import HighlightedText from "../components/HighlightedText.tsx";
import ForceSelect from "../components/ForceSelect.tsx";

// §B10/B13: a hung network request must not leave the UI stuck in
// "Working..." forever, and a fast-changing user (new request fired before
// an older one resolves) must never let the older, now-stale response land
// on top of a newer one. This mirrors the pattern already used by
// SmartAbbreviate.tsx's runGeneration() — request-id sequencing plus an
// AbortController, now brought to this page too (previously this page had
// neither, which was itself a real gap relative to that requirement).
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

/**
 * `state`/`dispatch` are owned by App.tsx (see src/ai/state.ts's top comment
 * for why) — this component reads and dispatches into that shared session
 * instead of holding its own useReducer/useState for anything that needs to
 * survive navigating away from this page. Only genuinely transient,
 * per-mount UI state (the "Copied." flash, and the AI provider choice which
 * is already durably persisted via localStorage) stays local.
 *
 * Editing pipeline (see state.ts's header comment for the full rationale):
 * AI result and JSSDM result are both editable text areas, never read-only
 * dead ends. "Send to Abbreviation" always reads the *edited* AI draft.
 * "Copy" always copies the *edited* final text. Nothing re-runs the engine
 * automatically just because the user typed in the final box — only the
 * explicit Re-abbreviate / De-abbreviate buttons do that.
 */
export default function AIWritingAssistant({
  force,
  setForce,
  state,
  dispatch,
}: {
  force: string;
  setForce: (f: string) => void;
  state: AssistantState;
  dispatch: Dispatch<AssistantAction>;
}) {
  const [copiedAI, setCopiedAI] = useState(false);
  const [copiedFinal, setCopiedFinal] = useState(false);
  const [provider, setProvider] = useState(loadStoredProvider);

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
  // & Polish, a typed follow-up, and now "Send to AI →" on the final result
  // — see sendFinalToAI() below for why that one needed fixing at all).
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

  // ROOT-CAUSE FIX (Phase 2 Priority 0): this button is labeled "Send to AI"
  // but previously did not call the AI at all — it only copied the current
  // final-edited text back into the (already-scrolled-past) draft input box
  // with no loading state, no result, and no visible feedback of any kind,
  // which is exactly what a user would experience as "Send to AI is not
  // working." It now actually sends the current final-edited text to the AI
  // as a follow-up turn in the existing conversation (same pipeline as the
  // "Refine further" box), without discarding anything already in this
  // session — the previous chat history, AI draft, and JSSDM result all
  // remain exactly as they were unless/until this new response replaces
  // aiFinal/aiEditedDraft on success (see REQUEST_SUCCESS in ai/state.ts).
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

  const isWhatsapp = state.outputMode === "whatsapp";

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>AI Writing Assistant</h2>
          <div className="view-sub">
            Helps with grammar, clarity and tone only — it never decides what's an authorized JSSDM abbreviation. Run its result through "JSSDM
            Abbreviation" below to get a result grounded in the manual. Every result along the way is yours to edit — nothing here is ever
            permanently read-only.
          </div>
        </div>
      </div>

      <div className="disclaimer">
        The AI provider is called through this site's own server function — no API key is ever stored in your browser or sent to you. Abbreviation
        correctness is still decided entirely by the deterministic JSSDM engine, not by the AI.
      </div>

      <div className="panel">
        <div className="ai-toolbar">
          <div>
            <label className="flabel">Output style</label>
            <div className="ai-mode-toggle">
              <button className={!isWhatsapp ? "active" : ""} onClick={() => dispatch({ type: "SET_OUTPUT_MODE", outputMode: "text" })}>
                Text
              </button>
              <button className={isWhatsapp ? "active" : ""} onClick={() => dispatch({ type: "SET_OUTPUT_MODE", outputMode: "whatsapp" })}>
                WhatsApp
              </button>
            </div>
          </div>
          <div>
            <label className="flabel">Operation</label>
            <div className="ai-mode-toggle">
              <button className={state.mode === "check" ? "active" : ""} onClick={() => dispatch({ type: "SET_MODE", mode: "check" })}>
                Check &amp; Polish
              </button>
              <button className={state.mode === "generate" ? "active" : ""} onClick={() => dispatch({ type: "SET_MODE", mode: "generate" })}>
                Generate
              </button>
            </div>
          </div>
          <div>
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
          <ForceSelect value={force} onChange={setForce} />
        </div>

        {isWhatsapp && (
          <div style={{ marginBottom: 10 }}>
            <label className="flabel" htmlFor="ai-signature">
              Your signature (optional — used only if you provide it; never invented)
            </label>
            <input
              id="ai-signature"
              type="text"
              placeholder='e.g. "BM" or "Maj Hemel"'
              value={state.signature}
              onChange={(e) => dispatch({ type: "SET_SIGNATURE", signature: e.target.value })}
              style={{ maxWidth: 260 }}
            />
          </div>
        )}

        <label className="flabel">Tone / expression</label>
        <div className="tone-row">
          {TONES.map((t) => (
            <button
              key={t}
              className={"chip" + (state.tone === t ? " active" : "")}
              onClick={() => dispatch({ type: "SET_TONE", tone: t })}
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
            style={{ marginBottom: 10 }}
          />
        )}

        <label className="flabel" htmlFor="ai-draft">
          {state.mode === "check" ? "Text to check & polish" : "Describe what you want written"}
        </label>
        <textarea
          id="ai-draft"
          value={state.draftInput}
          onChange={(e) => dispatch({ type: "SET_DRAFT_INPUT", text: e.target.value })}
          placeholder={
            state.mode === "check"
              ? "Paste your draft..."
              : isWhatsapp
                ? "e.g. Inform Sir that I have taken move from my present unit and will join the new unit on 02 September."
                : "e.g. A short memo requesting additional troop..."
          }
        />
        <div className="btnrow" style={{ marginTop: 10 }} aria-busy={state.loading}>
          <button className="btn" onClick={runInitial} disabled={state.loading || !state.draftInput.trim()}>
            {state.loading && <span className="spinner" aria-hidden="true" />}
            {state.loading ? "Working..." : state.mode === "check" ? "Check & Polish" : "Generate"}
          </button>
          {state.loading && (
            <button className="btn secondary small" onClick={stopAIRequest}>
              Stop
            </button>
          )}
        </div>
        {/* Once a first AI result exists, a later error is shown next to the
            action that actually failed (down near Send to AI / follow-up)
            instead of repeated here too. */}
        {state.error && !state.aiFinal && (
          <div className="result-block bad fade-in" style={{ marginTop: 10 }} role="alert">
            {state.error}{" "}
            <button
              className="btn secondary small"
              style={{ marginLeft: 8 }}
              onClick={() => (retryRef.current ? retryRef.current() : runInitial())}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {state.aiFinal && (
        <div className="panel fade-in">
          <div className="text-state-col">
            <h4>Original (never changed)</h4>
          </div>
          <div className="text-block" style={{ marginBottom: 14 }}>
            {state.original}
          </div>

          <div className="text-state-col">
            <h4>AI Result (editable — this is what gets sent to Abbreviation)</h4>
          </div>
          <textarea
            id="ai-edited-draft"
            value={state.aiEditedDraft ?? ""}
            onChange={(e) => dispatch({ type: "SET_AI_EDITED_DRAFT", text: e.target.value })}
            style={{ marginBottom: 8 }}
          />
          <div className="btnrow" style={{ marginBottom: 14 }}>
            <button className="btn small" onClick={() => copy(state.aiEditedDraft || "", setCopiedAI)}>
              Copy AI result
            </button>
            {copiedAI && <span className="copyok">Copied.</span>}
            <button className="btn secondary small" onClick={sendToAbbreviation}>
              Send to Abbreviation →
            </button>
          </div>

          {state.jssdmGenerated !== null && (
            <>
              <div className="text-state-col">
                <h4>JSSDM Generated Result (reference — what the engine just produced)</h4>
              </div>
              <HighlightedText text={state.jssdmGenerated} spans={state.jssdmGeneratedSpans} />

              <div className="text-state-col" style={{ marginTop: 12 }}>
                <h4>Final Edited Result (editable — this is what Copy copies)</h4>
              </div>
              <textarea
                id="final-edited"
                value={state.finalEdited ?? ""}
                onChange={(e) => dispatch({ type: "SET_FINAL_EDITED", text: e.target.value })}
                style={{ marginBottom: 8 }}
              />
              <div className="btnrow" style={{ marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn secondary small" onClick={reabbreviate}>
                  Re-abbreviate
                </button>
                <button className="btn secondary small" onClick={deabbreviateFinal}>
                  De-abbreviate
                </button>
                <button className="btn small" onClick={() => copy(state.finalEdited || "", setCopiedFinal)}>
                  Copy
                </button>
                {copiedFinal && <span className="copyok">Copied.</span>}
                <button className="btn secondary small" onClick={sendFinalToAI} disabled={state.loading || !state.finalEdited}>
                  {state.loading && <span className="spinner" aria-hidden="true" />}
                  {state.loading ? "Sending to AI..." : "Send to AI →"}
                </button>
                {state.loading && (
                  <button className="btn secondary small" onClick={stopAIRequest}>
                    Stop
                  </button>
                )}
              </div>
            </>
          )}

          {/* Covers a failure from Send to AI or a follow-up message — shown
              here (once an AI result already exists) rather than only up in
              the initial-request panel, since that panel is usually
              scrolled out of view by the time the user reaches this point. */}
          {state.error && (
            <div className="result-block bad fade-in" style={{ marginTop: 10 }} role="alert">
              {state.error}{" "}
              <button
                className="btn secondary small"
                style={{ marginLeft: 8 }}
                onClick={() => retryRef.current?.()}
              >
                Retry
              </button>
            </div>
          )}

          {state.chat.length > 0 && (
            <div className="chat-log" style={{ marginTop: 16 }} role="log" aria-label="Conversation with the AI">
              {state.chat.map((m, i) => (
                <div key={i} className={`chat-bubble ${m.role}`}>
                  {m.content}
                </div>
              ))}
            </div>
          )}

          <div className="field-row" style={{ marginTop: 10 }}>
            <input
              type="text"
              style={{ flex: 1 }}
              placeholder='Refine further, e.g. "make it more formal"'
              value={state.followupInput}
              onChange={(e) => dispatch({ type: "SET_FOLLOWUP_INPUT", text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") runFollowup();
              }}
            />
            <button className="btn secondary small" onClick={runFollowup} disabled={state.loading || !state.followupInput.trim()}>
              {state.loading && <span className="spinner" aria-hidden="true" />}
              {state.loading ? "Sending..." : "Send"}
            </button>
            {state.loading && (
              <button className="btn secondary small" onClick={stopAIRequest}>
                Stop
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
