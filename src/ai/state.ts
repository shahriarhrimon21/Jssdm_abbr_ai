/**
 * Pure state/reducer for the AI Writing Assistant, framework-agnostic so it
 * can be unit tested the same way the JSSDM engine is (see
 * src/jssdm/__tests__). The component in src/pages/AIWritingAssistant.tsx
 * wires this to React's useReducer.
 *
 * IMPORTANT — where this state actually lives: the useReducer() call for
 * this state is owned by App.tsx, NOT by AIWritingAssistant itself. App.tsx
 * is the one component that never unmounts while the app is open — the
 * per-feature pages (Abbreviate, Search, AI Writing, ...) are swapped in and
 * out by a switch in App.tsx, and any state that lives inside one of those
 * page components is destroyed the moment the user navigates away from it.
 * That was the root cause of the "AI Writing session is lost when
 * navigating away" bug: AIWritingAssistant used to own this via its own
 * local useReducer, so switching to Search/Abbreviate/etc. unmounted it and
 * the next visit started from initialAssistantState again. Lifting the
 * reducer to App.tsx and passing {state, dispatch} down as props fixes this
 * at the architecture level — no per-navigation save/restore glue needed,
 * because the state was never inside the thing that unmounts.
 *
 * Text states, per the spec, never silently overwritten:
 *   - original:    exactly what the user typed/pasted, untouched by anything.
 *   - aiFinal:      the AI's latest output (Check&Polish result, or a Generate
 *                   draft, refined further by chat follow-up). Only this field
 *                   changes when the AI responds.
 *   - jssdmFinal:   the result of running aiFinal (or original) through the
 *                   deterministic JSSDM Abbreviate engine via "Send to
 *                   Abbreviation". Only set by that explicit action, never by
 *                   the AI.
 * Each has its own Copy button in the UI; none is ever overwritten by another.
 *
 * outputMode/signature are the Text vs. WhatsApp global mode and the user's
 * own (never AI-invented) sign-off — see src/ai/whatsappStyle.ts. They are
 * modeled here alongside the rest of the session for the same reason: so
 * they survive navigation instead of resetting to their default every time
 * the AI Writing page remounts.
 *
 * draftInput/followupInput hold text the user is actively typing into the
 * two input boxes (the initial request box, and the "refine further" box)
 * *before* they submit it — these are lifted too so unsent, half-typed text
 * isn't silently lost by a navigation away and back, per the "any other
 * meaningful user-created state" requirement. loading/error are NOT lifted
 * in spirit even though they live in the same object: RESET and page-mount
 * both clear `error` (see AIWritingAssistant's mount effect), since a stale
 * error from a previous visit is exactly the kind of transient state that
 * should not persist.
 */
import type { ChatMessage } from "./client.ts";
import type { AssistantMode } from "./prompts.ts";
import type { OutputMode } from "./whatsappStyle.ts";

export interface AssistantState {
  mode: AssistantMode;
  tone: string;
  customTone: string;
  outputMode: OutputMode;
  signature: string;
  draftInput: string;
  followupInput: string;
  original: string;
  aiFinal: string | null;
  jssdmFinal: string | null;
  chat: ChatMessage[];
  loading: boolean;
  error: string | null;
}

export const initialAssistantState: AssistantState = {
  mode: "check",
  tone: "Neutral",
  customTone: "",
  outputMode: "text",
  signature: "",
  draftInput: "",
  followupInput: "",
  original: "",
  aiFinal: null,
  jssdmFinal: null,
  chat: [],
  loading: false,
  error: null,
};

export type AssistantAction =
  | { type: "SET_MODE"; mode: AssistantMode }
  | { type: "SET_TONE"; tone: string }
  | { type: "SET_CUSTOM_TONE"; customTone: string }
  | { type: "SET_OUTPUT_MODE"; outputMode: OutputMode }
  | { type: "SET_SIGNATURE"; signature: string }
  | { type: "SET_DRAFT_INPUT"; text: string }
  | { type: "SET_FOLLOWUP_INPUT"; text: string }
  | { type: "SET_ORIGINAL"; text: string }
  | { type: "REQUEST_START" }
  | { type: "REQUEST_SUCCESS"; text: string; userMessage: string }
  | { type: "REQUEST_ERROR"; error: string }
  | { type: "SET_JSSDM_FINAL"; text: string }
  | { type: "CLEAR_ERROR" }
  | { type: "RESET" };

export function assistantReducer(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode, error: null };
    case "SET_TONE":
      return { ...state, tone: action.tone };
    case "SET_CUSTOM_TONE":
      return { ...state, customTone: action.customTone };
    case "SET_OUTPUT_MODE":
      return { ...state, outputMode: action.outputMode };
    case "SET_SIGNATURE":
      return { ...state, signature: action.signature };
    case "SET_DRAFT_INPUT":
      return { ...state, draftInput: action.text };
    case "SET_FOLLOWUP_INPUT":
      return { ...state, followupInput: action.text };
    case "SET_ORIGINAL":
      return { ...state, original: action.text };
    case "REQUEST_START":
      return { ...state, loading: true, error: null };
    case "REQUEST_SUCCESS":
      return {
        ...state,
        loading: false,
        aiFinal: action.text,
        chat: [...state.chat, { role: "user", content: action.userMessage }, { role: "assistant", content: action.text }],
      };
    case "REQUEST_ERROR":
      return { ...state, loading: false, error: action.error };
    case "SET_JSSDM_FINAL":
      return { ...state, jssdmFinal: action.text };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "RESET":
      // Settings-like fields (mode, tone/customTone, outputMode, signature) are
      // preserved across a reset — they're user preferences, not session
      // content. Everything that represents actual drafted text/conversation
      // is cleared.
      return {
        ...initialAssistantState,
        mode: state.mode,
        tone: state.tone,
        customTone: state.customTone,
        outputMode: state.outputMode,
        signature: state.signature,
      };
    default:
      return state;
  }
}
