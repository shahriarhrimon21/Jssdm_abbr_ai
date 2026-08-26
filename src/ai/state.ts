/**
 * Pure state/reducer for the AI Writing Assistant, framework-agnostic so it
 * can be unit tested the same way the JSSDM engine is (see
 * src/jssdm/__tests__). The component in src/components/AIWritingAssistant.tsx
 * wires this to React's useReducer.
 *
 * Three text states, per the spec, never silently overwritten:
 *   - original:   exactly what the user typed/pasted, untouched by anything.
 *   - aiFinal:     the AI's latest output (Check&Polish result, or a Generate
 *                  draft, refined further by chat follow-up). Only this field
 *                  changes when the AI responds.
 *   - jssdmFinal:  the result of running aiFinal (or original) through the
 *                  deterministic JSSDM Abbreviate engine via "Send to
 *                  Abbreviation". Only set by that explicit action, never by
 *                  the AI.
 * Each has its own Copy button in the UI; none is ever overwritten by another.
 */
import type { ChatMessage } from "./client.ts";
import type { AssistantMode } from "./prompts.ts";

export interface AssistantState {
  mode: AssistantMode;
  tone: string;
  customTone: string;
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
  | { type: "SET_ORIGINAL"; text: string }
  | { type: "REQUEST_START" }
  | { type: "REQUEST_SUCCESS"; text: string; userMessage: string }
  | { type: "REQUEST_ERROR"; error: string }
  | { type: "SET_JSSDM_FINAL"; text: string }
  | { type: "RESET" };

export function assistantReducer(state: AssistantState, action: AssistantAction): AssistantState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode, error: null };
    case "SET_TONE":
      return { ...state, tone: action.tone };
    case "SET_CUSTOM_TONE":
      return { ...state, customTone: action.customTone };
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
    case "RESET":
      return { ...initialAssistantState, mode: state.mode, tone: state.tone };
    default:
      return state;
  }
}
