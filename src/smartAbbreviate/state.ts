/**
 * Smart Abbreviate — the pure state machine for the core workflow this
 * build was written against: Original Message -> AI Processing -> 2-3
 * Suggestions -> Validation -> User Selection -> User Editing -> Final
 * Valid Result -> Copy -> History.
 *
 * This file is deliberately free of anything async, timer-based, or
 * network-related (no fetch, no setTimeout/debounce, no localStorage, no
 * clipboard) — every state transition here is a synchronous, pure
 * reducer step, which is what makes the whole workflow's logic
 * exhaustively unit-testable with node:test and independently verifiable
 * from the async orchestration layer (the useSmartAbbreviate hook) that
 * wires this reducer up to real AI calls, debounce timers, and
 * online/offline detection.
 *
 * Suggestions are never trusted blind: buildSuggestion() is the ONLY path
 * by which a piece of AI (or engine) text becomes a Suggestion in this
 * state, and it always runs validateSuggestion() (and, for a compliance
 * problem specifically, attemptSafeCorrection()) before the result is
 * ever shown as selectable — see suggestionValidation.ts for why a
 * compliance problem is the one kind of issue that's ever auto-corrected,
 * and why an information-preservation problem never is.
 */
import { validateSuggestion, attemptSafeCorrection, type ValidationOutcome } from "../jssdm/suggestionValidation.ts";

export interface Suggestion {
  id: string;
  text: string;
  source: "ai" | "engine" | "history";
  validation: ValidationOutcome;
  /** Set only when attemptSafeCorrection() actually replaced this
   *  suggestion's text with the deterministic engine's own output because
   *  the AI's version had a compliance problem — never set for an
   *  information-preservation problem, which is never auto-corrected. */
  correctionNote: string | null;
}

export function buildSuggestion(
  original: string,
  rawText: string,
  force: string | null | undefined,
  source: "ai" | "engine" | "history",
  id: string,
): Suggestion {
  let text = rawText;
  let validation = validateSuggestion(original, text, force);
  let correctionNote: string | null = null;

  if (!validation.compliant) {
    const correction = attemptSafeCorrection(original, force);
    if (correction.corrected !== null) {
      text = correction.corrected;
      validation = validateSuggestion(original, text, force);
      correctionNote = correction.note;
    }
  }

  return { id, text, source, validation, correctionNote };
}

export function buildSuggestions(
  original: string,
  rawTexts: string[],
  force: string | null | undefined,
  source: "ai" | "engine" = "ai",
): Suggestion[] {
  return rawTexts.map((t, i) => buildSuggestion(original, t, force, source, `${source}_${i}`));
}

/** First suggestion whose validation passed; falls back to the first
 *  suggestion at all (still shown, still marked invalid) so something is
 *  always selected and visible rather than leaving the workspace empty —
 *  per the "keep invalid suggestions visible, never hide them" rule. */
function pickAutoSelected(suggestions: Suggestion[]): Suggestion | null {
  if (suggestions.length === 0) return null;
  return suggestions.find((s) => s.validation.valid) || suggestions[0];
}

export type PendingConfirmation =
  | { kind: "apply-regeneration"; suggestions: Suggestion[] }
  | { kind: "switch-suggestion"; targetId: string }
  | { kind: "new-message" };

export type Status = "idle" | "loading" | "ready" | "error";

export interface SmartAbbreviateState {
  force: string | null;
  online: boolean;

  originalInput: string;

  status: Status;
  error: string | null;
  /** A non-blocking FYI banner, distinct from `error` — set alongside a
   *  successful GENERATE_SUCCESS to explain when the suggestion(s) just
   *  applied came from the deterministic engine rather than the AI (offline,
   *  or the AI call itself failed) — the workspace still has a usable,
   *  guaranteed-valid result, this is just honesty about where it came
   *  from. Cleared automatically the next time a real AI success occurs. */
  notice: string | null;
  /** Monotonic id of the most recently STARTED generate/regenerate request.
   *  GENERATE_SUCCESS/GENERATE_ERROR/GENERATE_CANCEL only take effect when
   *  their requestId still matches this — the guard that keeps a
   *  slow-to-resolve older request from ever overwriting a newer result. */
   pendingRequestId: number | null;

  suggestions: Suggestion[];
  selectedSuggestionId: string | null;

  /** The user's editable working copy of the result — starts equal to the
   *  selected suggestion's text and diverges only once the user actually
   *  types in it. */
  finalResult: string;
  /** True once finalResult no longer matches the selected suggestion's own
   *  text — i.e. there are hand-edits that a silent overwrite would
   *  destroy. This is the flag every "would this silently discard the
   *  user's work?" check in this reducer is built around. */
  finalDirty: boolean;
  /** Validation of finalResult specifically. Kept separate from the
   *  selected suggestion's own `validation` because finalResult can drift
   *  from that suggestion's text via hand-editing; re-validated on
   *  selection change (immediately) and after hand-edits (debounced, via
   *  VALIDATE_FINAL_RESULT — see that action's comment for why the debounce
   *  boundary sits at the hook layer, not in SET_FINAL_EDITED itself). */
  finalValidation: ValidationOutcome | null;

  /** Set whenever an action would discard something the user would not
   *  expect to lose; UI must show a Continue/Cancel prompt keyed off this
   *  and dispatch CONFIRM_PENDING_ACTION / CANCEL_PENDING_ACTION. Never
   *  more than one at a time — starting a new generate request supersedes
   *  (clears) a stale unanswered one from an older request. */
  pendingConfirmation: PendingConfirmation | null;

  /** Sequence id of the most recent record saved to history via Copy —
   *  purely informational for the UI (e.g. to key a "Copied" toast); the
   *  reducer itself never reads it. */
  lastCopiedRecordId: string | null;

  /** Set by LOAD_FROM_HISTORY when the workspace was populated by reopening
   *  a saved history record (the "re-edit" flow) — lets the UI offer
   *  "Update Existing" vs "Save as New" on the next Copy instead of the
   *  normal dedup-aware recordCopy() path. Cleared by RESET, by starting a
   *  fresh AI regeneration (a new derivation, not an edit of the old
   *  record), and by editing the original message (same reasoning). */
  loadedHistoryRecordId: string | null;
}

export const initialSmartAbbreviateState: SmartAbbreviateState = {
  force: "all",
  online: true,
  originalInput: "",
  status: "idle",
  error: null,
  notice: null,
  pendingRequestId: null,
  suggestions: [],
  selectedSuggestionId: null,
  finalResult: "",
  finalDirty: false,
  finalValidation: null,
  pendingConfirmation: null,
  lastCopiedRecordId: null,
  loadedHistoryRecordId: null,
};

export type SmartAbbreviateAction =
  | { type: "SET_FORCE"; force: string | null }
  | { type: "SET_ONLINE"; online: boolean }
  | { type: "SET_ORIGINAL"; text: string }
  | { type: "GENERATE_START"; requestId: number }
  | {
      type: "GENERATE_SUCCESS";
      requestId: number;
      original: string;
      rawSuggestions: string[];
      source: "ai" | "engine";
      force: string | null;
      /** Optional FYI banner text — set when this "success" is really a
       *  degraded fallback (offline, or the AI call itself failed) rather
       *  than a genuine AI result. Omit/undefined for a real AI success. */
      degradedNotice?: string | null;
    }
  | { type: "GENERATE_ERROR"; requestId: number; error: string }
  | { type: "GENERATE_CANCEL"; requestId: number }
  | { type: "SELECT_SUGGESTION"; id: string }
  | { type: "EDIT_SUGGESTION"; id: string; text: string }
  | { type: "SET_FINAL_EDITED"; text: string }
  | { type: "VALIDATE_FINAL_RESULT"; forText: string; validation: ValidationOutcome }
  | { type: "REQUEST_NEW_MESSAGE" }
  | { type: "CONFIRM_PENDING_ACTION" }
  | { type: "CANCEL_PENDING_ACTION" }
  | { type: "COPY_SUCCESS"; recordId: string }
  | { type: "CLEAR_ERROR" }
  | { type: "LOAD_FROM_HISTORY"; original: string; selectedSuggestionText: string; finalResult: string; recordId: string; force: string | null }
  | { type: "RESET" };

function applySuggestions(state: SmartAbbreviateState, suggestions: Suggestion[]): SmartAbbreviateState {
  const selected = pickAutoSelected(suggestions);
  return {
    ...state,
    status: "ready",
    suggestions,
    selectedSuggestionId: selected?.id ?? null,
    finalResult: selected?.text ?? "",
    finalDirty: false,
    finalValidation: selected?.validation ?? null,
    pendingConfirmation: null,
  };
}

function switchToSuggestion(state: SmartAbbreviateState, id: string): SmartAbbreviateState {
  const target = state.suggestions.find((s) => s.id === id);
  if (!target) return state;
  return {
    ...state,
    selectedSuggestionId: id,
    finalResult: target.text,
    finalDirty: false,
    finalValidation: target.validation,
    pendingConfirmation: null,
  };
}

/** originalInput.trim() !== "" is treated as "there's unsaved work" for the
 *  New Message confirmation gate — deliberately broader than just
 *  finalDirty, since typed-but-not-yet-generated input is work in progress
 *  too and would silently vanish on an unguarded reset otherwise. */
export function hasUnsavedWork(state: SmartAbbreviateState): boolean {
  return state.originalInput.trim() !== "";
}

export function smartAbbreviateReducer(state: SmartAbbreviateState, action: SmartAbbreviateAction): SmartAbbreviateState {
  switch (action.type) {
    case "SET_FORCE":
      return { ...state, force: action.force };

    case "SET_ONLINE":
      return { ...state, online: action.online };

    case "SET_ORIGINAL": {
      const text = action.text;
      if (text.trim() === "") {
        // §29: empty input -> no AI call, clear suggestions, reset result
        // state, normal empty state. This is the one case SET_ORIGINAL
        // itself resets downstream state synchronously; for non-empty text
        // the existing suggestions/result are deliberately left alone here
        // — the hook decides, after its own debounce, whether/how to
        // regenerate, and GENERATE_SUCCESS is what actually replaces them
        // (with the edit-protection confirmation gate if needed).
        return {
          ...state,
          originalInput: text,
          status: "idle",
          error: null,
          notice: null,
          pendingRequestId: null,
          suggestions: [],
          selectedSuggestionId: null,
          finalResult: "",
          finalDirty: false,
          finalValidation: null,
          pendingConfirmation: null,
          loadedHistoryRecordId: null,
        };
      }
      return { ...state, originalInput: text, loadedHistoryRecordId: null };
    }

    case "GENERATE_START":
      // A new request always supersedes whatever was pending before it —
      // the hook is responsible for actually aborting the superseded
      // request's network call; this just makes sure its eventual
      // GENERATE_SUCCESS/ERROR (if it still lands) is ignored below.
      return {
        ...state,
        status: "loading",
        error: null,
        pendingRequestId: action.requestId,
        pendingConfirmation: null,
        loadedHistoryRecordId: null,
      };

    case "GENERATE_SUCCESS": {
      if (action.requestId !== state.pendingRequestId) return state; // stale request — ignore
      const suggestions = buildSuggestions(action.original, action.rawSuggestions, action.force, action.source);
      const notice = action.degradedNotice ?? null;
      if (state.finalDirty) {
        // §13: applying this would silently replace hand-edited work —
        // stash it behind a confirmation instead of applying it.
        return {
          ...state,
          status: "ready",
          pendingRequestId: null,
          pendingConfirmation: { kind: "apply-regeneration", suggestions },
          notice,
        };
      }
      return { ...applySuggestions(state, suggestions), pendingRequestId: null, notice };
    }

    case "GENERATE_ERROR": {
      if (action.requestId !== state.pendingRequestId) return state; // stale request — ignore
      return {
        ...state,
        status: state.suggestions.length > 0 ? "ready" : "error",
        error: action.error,
        pendingRequestId: null,
      };
    }

    case "GENERATE_CANCEL": {
      if (action.requestId !== state.pendingRequestId) return state;
      return {
        ...state,
        status: state.suggestions.length > 0 ? "ready" : "idle",
        error: null,
        pendingRequestId: null,
      };
    }

    case "SELECT_SUGGESTION": {
      if (action.id === state.selectedSuggestionId) return state;
      if (state.finalDirty) {
        // §14: switching away from unsaved edits needs confirmation.
        return { ...state, pendingConfirmation: { kind: "switch-suggestion", targetId: action.id } };
      }
      return switchToSuggestion(state, action.id);
    }

    case "EDIT_SUGGESTION": {
      const idx = state.suggestions.findIndex((s) => s.id === action.id);
      if (idx === -1) return state;
      const updated = buildSuggestion(state.originalInput, action.text, state.force, state.suggestions[idx].source, action.id);
      const suggestions = state.suggestions.slice();
      suggestions[idx] = updated;
      const isSelected = state.selectedSuggestionId === action.id;
      if (isSelected && !state.finalDirty) {
        // The card being edited is the one currently driving finalResult,
        // and the user hasn't separately diverged finalResult yet — keep
        // them in sync rather than leaving the visible final box stale.
        return { ...state, suggestions, finalResult: updated.text, finalValidation: updated.validation };
      }
      // Either a different card was edited, or finalResult already has its
      // own independent hand-edits — never silently overwrite those.
      return { ...state, suggestions };
    }

    case "SET_FINAL_EDITED":
      // Only the raw text + dirty flag change synchronously on every
      // keystroke; re-validation is intentionally NOT recomputed here (see
      // VALIDATE_FINAL_RESULT) — §16 asks for debounced re-validation, not
      // per-keystroke, and the debounce timer itself is a side effect that
      // belongs in the hook, not in this pure reducer.
      return {
        ...state,
        finalResult: action.text,
        finalDirty: (() => {
          const selected = state.suggestions.find((s) => s.id === state.selectedSuggestionId);
          return selected ? action.text !== selected.text : action.text !== "";
        })(),
      };

    case "VALIDATE_FINAL_RESULT":
      if (action.forText !== state.finalResult) return state; // stale debounce fire — text moved on since
      return { ...state, finalValidation: action.validation };

    case "REQUEST_NEW_MESSAGE":
      if (hasUnsavedWork(state)) {
        return { ...state, pendingConfirmation: { kind: "new-message" } };
      }
      return smartAbbreviateReducer(state, { type: "RESET" });

    case "CONFIRM_PENDING_ACTION": {
      const pending = state.pendingConfirmation;
      if (!pending) return state;
      if (pending.kind === "apply-regeneration") {
        return applySuggestions(state, pending.suggestions);
      }
      if (pending.kind === "switch-suggestion") {
        return switchToSuggestion(state, pending.targetId);
      }
      // "new-message"
      return smartAbbreviateReducer(state, { type: "RESET" });
    }

    case "CANCEL_PENDING_ACTION":
      return { ...state, pendingConfirmation: null };

    case "COPY_SUCCESS":
      return { ...state, lastCopiedRecordId: action.recordId };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "LOAD_FROM_HISTORY": {
      // Re-populates the workspace from a saved record (the history "re-edit"
      // flow) — reconstructs a single suggestion from what was selected at
      // copy time, then applies the record's (possibly further hand-edited)
      // final text on top, exactly like reopening a draft.
      const suggestion = buildSuggestion(action.original, action.selectedSuggestionText, action.force, "history", "history_0");
      const finalDirty = action.finalResult !== suggestion.text;
      const finalValidation = finalDirty ? validateSuggestion(action.original, action.finalResult, action.force) : suggestion.validation;
      return {
        ...state,
        originalInput: action.original,
        status: "ready",
        error: null,
        pendingRequestId: null,
        suggestions: [suggestion],
        selectedSuggestionId: suggestion.id,
        finalResult: action.finalResult,
        finalDirty,
        finalValidation,
        pendingConfirmation: null,
        loadedHistoryRecordId: action.recordId,
      };
    }

    case "RESET":
      return {
        ...initialSmartAbbreviateState,
        force: state.force,
        online: state.online,
      };

    default:
      return state;
  }
}
