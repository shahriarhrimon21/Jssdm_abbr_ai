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
 * FIVE distinct text states make up the pipeline, and the app never
 * silently overwrites one of them on the user's behalf — only an explicit
 * action (a button click, or typing directly into the field that field
 * belongs to) ever changes it:
 *
 *   1. original         — exactly what the user typed/pasted to ask the AI
 *                          for something. Set once by "Generate"/"Check &
 *                          Polish"; never touched again.
 *   2. aiFinal           — the AI's own output, verbatim, for this turn.
 *                          This is what's shown/replayed in the chat log as
 *                          "what the AI said" — it is NOT the editable box.
 *   3. aiEditedDraft      — the user's editable working copy of the AI
 *                          result. Starts out equal to aiFinal every time a
 *                          new AI response arrives (REQUEST_SUCCESS), then
 *                          the user can freely retype it — see Part 1/2 of
 *                          the editing-workflow spec. "Send to Abbreviation"
 *                          always reads THIS field, never aiFinal, so a
 *                          stale/original AI response can never be sent by
 *                          mistake once the user has edited it.
 *   4. jssdmGenerated(+Spans) — the JSSDM engine's fresh, automatic output
 *                          the moment it's run (Send to Abbreviation /
 *                          Re-abbreviate / De-abbreviate). This is a
 *                          reference value ("what the engine produced"),
 *                          shown read-only with its highlight spans — it is
 *                          NOT the editable box either.
 *   5. finalEdited        — the user's editable working copy of the JSSDM
 *                          result. Starts out equal to jssdmGenerated every
 *                          time the engine (re)runs, then the user can
 *                          freely retype it. The Copy button always copies
 *                          THIS field, and nothing ever overwrites it except
 *                          those three explicit engine actions — typing in
 *                          this box never triggers the engine again on its
 *                          own (Part 6: no silent re-abbreviation on edit).
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
 *
 * loadedHistoryRecordId (Phase 1.5 Part 1) tracks which saved message-history
 * record, if any, the current session is "open" on — the thing that decides
 * whether "Save to History" behaves as Update Existing (same record) or
 * Save as New. It is set by LOAD_HISTORY_RECORD (Open/Edit from history) and
 * by SET_LOADED_HISTORY_RECORD_ID (right after a Save-as-New, so a further
 * save on the same session now defaults to updating that new record). It is
 * cleared by SET_ORIGINAL and RESET — "starting a fresh regeneration" from a
 * new original/topic is a new derivation, not an edit of the previously
 * loaded record — but deliberately survives everything else (editing the AI
 * draft, running/re-running the JSSDM engine, editing the final result,
 * follow-up refinements, Send to AI) since those are all still working on
 * the SAME loaded record, matching how a saved record is actually reused.
 */
import type { ChatMessage } from "./client.ts";
import type { AssistantMode } from "./prompts.ts";
import type { OutputMode, RecipientType } from "./whatsappStyle.ts";
import { applyClosingLine, applyRecipientEtiquette, ensureGreetingBlankLine } from "./whatsappClosing.ts";
import type { Span } from "../jssdm/types.ts";

export interface AssistantState {
  mode: AssistantMode;
  tone: string;
  customTone: string;
  outputMode: OutputMode;
  /** Senior/Junior recipient-type toggle — a session-level "settings" field
   *  (same treatment as mode/tone/outputMode/signature below: preserved
   *  across RESET, not part of a saved message-history record) that governs
   *  the salutation/honorific rules for every AI request going forward. See
   *  ai/prompts.ts and ai/whatsappStyle.ts for how it shapes the prompt, and
   *  REQUEST_SUCCESS below for the deterministic Junior-mode guarantee pass.
   *  Defaults to "senior" so existing users see no behaviour change unless
   *  they explicitly switch it (the toggle spec's Part 3 requirement). */
  recipientType: RecipientType;
  signature: string;
  draftInput: string;
  followupInput: string;
  original: string;
  aiFinal: string | null;
  aiEditedDraft: string | null;
  jssdmGenerated: string | null;
  jssdmGeneratedSpans: Span[];
  finalEdited: string | null;
  chat: ChatMessage[];
  loading: boolean;
  error: string | null;
  loadedHistoryRecordId: string | null;
}

export const initialAssistantState: AssistantState = {
  mode: "check",
  tone: "Neutral",
  customTone: "",
  outputMode: "text",
  recipientType: "senior",
  signature: "",
  draftInput: "",
  followupInput: "",
  original: "",
  aiFinal: null,
  aiEditedDraft: null,
  jssdmGenerated: null,
  jssdmGeneratedSpans: [],
  finalEdited: null,
  chat: [],
  loading: false,
  error: null,
  loadedHistoryRecordId: null,
};

export type AssistantAction =
  | { type: "SET_MODE"; mode: AssistantMode }
  | { type: "SET_TONE"; tone: string }
  | { type: "SET_CUSTOM_TONE"; customTone: string }
  | { type: "SET_OUTPUT_MODE"; outputMode: OutputMode }
  | { type: "SET_RECIPIENT_TYPE"; recipientType: RecipientType }
  | { type: "SET_SIGNATURE"; signature: string }
  | { type: "SET_DRAFT_INPUT"; text: string }
  | { type: "SET_FOLLOWUP_INPUT"; text: string }
  | { type: "SET_ORIGINAL"; text: string }
  | { type: "REQUEST_START" }
  | { type: "REQUEST_SUCCESS"; text: string; userMessage: string }
  | { type: "REQUEST_ERROR"; error: string }
  | { type: "REQUEST_CANCEL" }
  | { type: "SET_AI_EDITED_DRAFT"; text: string }
  | { type: "JSSDM_GENERATED"; text: string; spans: Span[] }
  | { type: "SET_FINAL_EDITED"; text: string }
  | { type: "CLEAR_ERROR" }
  | { type: "RESET" }
  | {
      type: "LOAD_HISTORY_RECORD";
      recordId: string;
      outputMode: OutputMode;
      original: string;
      aiFinal: string;
      aiEditedDraft: string;
      jssdmGenerated: string | null;
      finalEdited: string | null;
    }
  | { type: "SET_LOADED_HISTORY_RECORD_ID"; recordId: string | null };

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
    case "SET_RECIPIENT_TYPE":
      return { ...state, recipientType: action.recipientType };
    case "SET_SIGNATURE":
      return { ...state, signature: action.signature };
    case "SET_DRAFT_INPUT":
      return { ...state, draftInput: action.text };
    case "SET_FOLLOWUP_INPUT":
      return { ...state, followupInput: action.text };
    case "SET_ORIGINAL":
      // A fresh Generate/Check & Polish from a new top-box draft is "starting
      // a fresh regeneration" — a new derivation, not an edit of whatever
      // history record was previously loaded (Part 1's loadedHistoryRecordId
      // rule; see the header comment).
      return { ...state, original: action.text, loadedHistoryRecordId: null };
    case "REQUEST_START":
      return { ...state, loading: true, error: null };
    case "REQUEST_SUCCESS": {
      // A fresh AI response resets the *editable AI draft* to match it (the
      // user would expect to see the AI's new answer, not their old edits
      // grafted onto it) — but deliberately does NOT touch jssdmGenerated/
      // finalEdited. Those represent a later, separate pipeline stage the
      // user may have already hand-edited; only an explicit
      // Send to Abbreviation / Re-abbreviate / De-abbreviate click is
      // allowed to overwrite them (see the file header and Part 6/10 of the
      // editing-workflow spec this was built against).
      //
      // WhatsApp-mode only: run three deterministic formatting passes
      // (whatsappClosing.ts) on the AI's text before it ever reaches the
      // screen, rather than trusting the AI to have gotten any of them
      // right:
      //  - applyClosingLine guarantees "For your kind info/permission/
      //    consideration[, sir]." is present, correct (wording matching
      //    state.recipientType), non-duplicated, and immediately before
      //    "Regards" whenever the message's own content calls for it — and
      //    now also owns the signature: it discards whatever closing/
      //    signature block the AI produced on its own (unreliable — see
      //    that file's header) and appends state.signature, and only
      //    state.signature, on its own line immediately after "Regards".
      //  - applyRecipientEtiquette (Junior only — a no-op for Senior)
      //    forces the exact "Assalamualaikum Dear," opener and scrubs any
      //    stray "sir"/"Dear" the AI left elsewhere, e.g. carried over from
      //    a Senior-style draft the user pasted in. Runs after
      //    applyClosingLine so it sees the closing line in its final,
      //    already-correct position and wording.
      //  - ensureGreetingBlankLine guarantees exactly one blank line
      //    between the greeting and the body — previously only shown by
      //    example in the style guide, never enforced, so it was
      //    inconsistent. Runs last so it sees the final greeting line
      //    (post-etiquette-pass) regardless of recipientType.
      // All three run once, here, at generation time only; none is re-run
      // just because the user edits the box afterward (SET_AI_EDITED_DRAFT
      // below never calls them), so a deliberate manual edit or removal is
      // respected.
      const text =
        state.outputMode === "whatsapp"
          ? ensureGreetingBlankLine(
              applyRecipientEtiquette(applyClosingLine(action.text, state.recipientType, state.signature), state.recipientType),
            )
          : action.text;
      return {
        ...state,
        loading: false,
        aiFinal: text,
        aiEditedDraft: text,
        chat: [...state.chat, { role: "user", content: action.userMessage }, { role: "assistant", content: text }],
      };
    }
    case "REQUEST_ERROR":
      return { ...state, loading: false, error: action.error };
    case "REQUEST_CANCEL":
      // A deliberate Stop click, or a superseded request being abandoned in
      // favour of a newer one — either way this is not a failure, so no
      // `error` is set.
      return { ...state, loading: false };
    case "SET_AI_EDITED_DRAFT":
      return { ...state, aiEditedDraft: action.text };
    case "JSSDM_GENERATED":
      // An explicit engine run (Send to Abbreviation / Re-abbreviate /
      // De-abbreviate) is exactly the case where resetting the editable
      // final box to match the fresh output IS correct — the user just
      // asked for a new one. Typing into finalEdited afterwards will never
      // trigger this action on its own.
      return { ...state, jssdmGenerated: action.text, jssdmGeneratedSpans: action.spans, finalEdited: action.text };
    case "SET_FINAL_EDITED":
      return { ...state, finalEdited: action.text };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "RESET":
      // Settings-like fields (mode, tone/customTone, outputMode,
      // recipientType, signature) are preserved across a reset — they're
      // user preferences, not session content. Everything that represents
      // actual drafted text/conversation
      // is cleared — including loadedHistoryRecordId: a Reset starts a
      // wholly fresh session, not an edit of whatever record was open.
      return {
        ...initialAssistantState,
        mode: state.mode,
        tone: state.tone,
        customTone: state.customTone,
        outputMode: state.outputMode,
        recipientType: state.recipientType,
        signature: state.signature,
      };
    case "LOAD_HISTORY_RECORD":
      // "Open / Edit" from the message-history page — replaces the entire
      // live pipeline with the saved record's fields (see
      // ai/messageHistory.ts's pipelineFromRecord, the inverse of this) and
      // marks this record as the one now "open," so a subsequent save
      // defaults to Update Existing rather than creating a duplicate.
      // jssdmGeneratedSpans is not persisted (a regenerable display
      // artifact, see messageHistory.ts) — it comes back empty; clicking
      // Re-abbreviate/De-abbreviate regenerates real spans if needed. The
      // chat log is reseeded with a single reconstructed turn (rather than
      // left empty) so a "Refine further" follow-up on a reopened record
      // still has the request/response context it needs — the full
      // multi-turn conversation isn't persisted, only the final AI turn.
      return {
        ...state,
        loadedHistoryRecordId: action.recordId,
        outputMode: action.outputMode,
        original: action.original,
        aiFinal: action.aiFinal,
        aiEditedDraft: action.aiEditedDraft,
        jssdmGenerated: action.jssdmGenerated,
        jssdmGeneratedSpans: [],
        finalEdited: action.finalEdited,
        chat: [
          { role: "user", content: action.original },
          { role: "assistant", content: action.aiFinal },
        ],
        error: null,
      };
    case "SET_LOADED_HISTORY_RECORD_ID":
      return { ...state, loadedHistoryRecordId: action.recordId };
    default:
      return state;
  }
}
