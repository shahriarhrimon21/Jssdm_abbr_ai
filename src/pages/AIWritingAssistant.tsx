import { useReducer, useState } from "react";
import { assistantReducer, initialAssistantState } from "../ai/state.ts";
import { buildSystemPrompt, TONES } from "../ai/prompts.ts";
import { callAI } from "../ai/client.ts";
import { runAbbreviate } from "../jssdm/abbreviationEngine.ts";
import HighlightedText from "../components/HighlightedText.tsx";
import ForceSelect from "../components/ForceSelect.tsx";

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

export default function AIWritingAssistant({ force, setForce }: { force: string; setForce: (f: string) => void }) {
  const [state, dispatch] = useReducer(assistantReducer, initialAssistantState);
  const [draftInput, setDraftInput] = useState("");
  const [followup, setFollowup] = useState("");
  const [copiedAI, setCopiedAI] = useState(false);
  const [copiedJssdm, setCopiedJssdm] = useState(false);
  const [provider, setProvider] = useState(loadStoredProvider);

  function changeProvider(id: string) {
    setProvider(id);
    storeProvider(id);
  }

  async function runInitial() {
    if (!draftInput.trim()) return;
    dispatch({ type: "SET_ORIGINAL", text: draftInput });
    dispatch({ type: "REQUEST_START" });
    const systemPrompt = buildSystemPrompt(state.mode, state.tone, state.customTone);
    const result = await callAI({
      provider,
      systemPrompt,
      messages: [{ role: "user", content: draftInput }],
    });
    if (result.ok && result.text) {
      dispatch({ type: "REQUEST_SUCCESS", text: result.text, userMessage: draftInput });
    } else {
      dispatch({ type: "REQUEST_ERROR", error: result.error || "The AI request failed." });
    }
  }

  async function runFollowup() {
    if (!followup.trim() || !state.aiFinal) return;
    dispatch({ type: "REQUEST_START" });
    const systemPrompt = buildSystemPrompt(state.mode, state.tone, state.customTone);
    const result = await callAI({
      provider,
      systemPrompt,
      messages: [...state.chat, { role: "user", content: followup }],
    });
    const msg = followup;
    setFollowup("");
    if (result.ok && result.text) {
      dispatch({ type: "REQUEST_SUCCESS", text: result.text, userMessage: msg });
    } else {
      dispatch({ type: "REQUEST_ERROR", error: result.error || "The AI request failed." });
    }
  }

  function runJssdm() {
    if (!state.aiFinal) return;
    const r = runAbbreviate(state.aiFinal, force);
    dispatch({ type: "SET_JSSDM_FINAL", text: r.output });
  }

  function copy(text: string, setter: (v: boolean) => void) {
    navigator.clipboard?.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 1500);
    });
  }

  const jssdmSpans = state.jssdmFinal ? runAbbreviate(state.aiFinal || "", force).outSpans : [];

  return (
    <div>
      <div className="view-head">
        <div>
          <h2>AI Writing Assistant</h2>
          <div className="view-sub">
            Helps with grammar, clarity and tone only — it never decides what's an authorized JSSDM abbreviation. Run its result through "JSSDM
            Abbreviation" below to get a result grounded in the manual.
          </div>
        </div>
      </div>

      <div className="disclaimer">
        The AI provider is called through this site's own server function — no API key is ever stored in your browser or sent to you. Abbreviation
        correctness is still decided entirely by the deterministic JSSDM engine, not by the AI.
      </div>

      <div className="panel">
        <div className="ai-toolbar">
          <div className="ai-mode-toggle">
            <button className={state.mode === "check" ? "active" : ""} onClick={() => dispatch({ type: "SET_MODE", mode: "check" })}>
              Check &amp; Polish
            </button>
            <button className={state.mode === "generate" ? "active" : ""} onClick={() => dispatch({ type: "SET_MODE", mode: "generate" })}>
              Generate
            </button>
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
        <textarea id="ai-draft" value={draftInput} onChange={(e) => setDraftInput(e.target.value)} placeholder={state.mode === "check" ? "Paste your draft..." : "e.g. A short memo requesting additional troop..."} />
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button className="btn" onClick={runInitial} disabled={state.loading || !draftInput.trim()}>
            {state.loading ? "Working..." : state.mode === "check" ? "Check & Polish" : "Generate"}
          </button>
        </div>
        {state.error && <div className="result-block bad" style={{ marginTop: 10 }}>{state.error}</div>}
      </div>

      {state.aiFinal && (
        <div className="panel">
          <div className="text-state-col">
            <h4>Original (never changed)</h4>
          </div>
          <div className="text-block" style={{ marginBottom: 14 }}>
            {state.original}
          </div>

          <div className="text-state-col">
            <h4>AI Final</h4>
          </div>
          <div className="text-block" style={{ marginBottom: 8 }}>
            {state.aiFinal}
          </div>
          <div className="btnrow" style={{ marginBottom: 14 }}>
            <button className="btn small" onClick={() => copy(state.aiFinal!, setCopiedAI)}>
              Copy AI result
            </button>
            {copiedAI && <span className="copyok">Copied.</span>}
            <button className="btn secondary small" onClick={runJssdm}>
              Run through JSSDM Abbreviation →
            </button>
          </div>

          {state.jssdmFinal && (
            <>
              <div className="text-state-col">
                <h4>JSSDM Final</h4>
              </div>
              <HighlightedText text={state.jssdmFinal} spans={jssdmSpans} />
              <div className="btnrow" style={{ marginTop: 10 }}>
                <button className="btn small" onClick={() => copy(state.jssdmFinal!, setCopiedJssdm)}>
                  Copy JSSDM result
                </button>
                {copiedJssdm && <span className="copyok">Copied.</span>}
              </div>
            </>
          )}

          {state.chat.length > 0 && (
            <div className="chat-log" style={{ marginTop: 16 }}>
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
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runFollowup();
              }}
            />
            <button className="btn secondary small" onClick={runFollowup} disabled={state.loading || !followup.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
