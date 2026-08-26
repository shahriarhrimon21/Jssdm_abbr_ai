/**
 * Deterministic closing-line policy for WhatsApp-mode messages.
 *
 * The AI is instructed (see whatsappStyle.ts) to pick the right closing
 * itself, but AI output is not reliable enough on its own to guarantee the
 * exact required structure — it can omit the line, use the wrong one of the
 * three, place it in the wrong spot, or duplicate it. This module is the
 * deterministic, structured-logic layer the request asked for ("do not rely
 * entirely on AI if the application can reliably determine the intent
 * through structured logic"): it classifies the message's purpose from its
 * own text and then guarantees the correct line — or none at all, when none
 * applies — sits on its own line immediately before "Regards", exactly
 * once. It never runs on plain "text" mode output, and it only ever runs
 * once, at generation time (see ai/state.ts's REQUEST_SUCCESS) — never on
 * every keystroke while the user is editing, so a deliberate manual edit or
 * removal afterward is respected rather than silently overwritten.
 */

export type ClosingIntent = "info" | "permission" | "consideration" | null;

/** Exact required wording (Part 12) — lowercase "sir", "info" not
 *  "information", "consideration" (never "opinion") for the opinion/
 *  decision case. */
export const CLOSING_LINES: Record<Exclude<ClosingIntent, null>, string> = {
  info: "For your kind info, sir.",
  permission: "For your kind permission, sir.",
  consideration: "For your kind consideration, sir.",
};

/** Matches any of the three closing lines regardless of which one, plus the
 *  disallowed variant wordings ("information", "opinion") so a wrong or
 *  duplicated AI-produced line is recognized and removed, not just the
 *  exact-correct one. Deliberately NOT anchored to a fixed capitalization of
 *  "Sir"/"sir" — the AI may emit either. */
const CLOSING_LINE_RE = /^\s*for your kind (?:info(?:rmation)?|permission|consideration|opinion)\s*,?\s*sir\.?\s*$/i;

const REGARDS_RE = /^\s*regards\.?\s*$/i;

/** First-line salutation detector — either a recognized greeting opener, or
 *  (matching this app's own style guide's own convention, e.g.
 *  "Assalamualaikum Sir,") a short line ending in a comma, since that's how
 *  a salutation addressed to the recipient conventionally reads in this
 *  message style. Only ever applied to the first body line. */
function isGreetingLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(assalamualaikum|salam|dear|good\s+(morning|afternoon|evening|day)|hi|hello)\b/i.test(t)) return true;
  if (/,\s*$/.test(t) && t.split(/\s+/).length <= 5) return true;
  return false;
}

/** Stock acknowledgements/greetings/very short replies that this closing
 *  policy must never force a line onto (Part 5) — matched as the ENTIRE
 *  remaining message content, not as a substring, so a real report that
 *  merely starts with "Received" (e.g. "Received the consignment and
 *  distributed it to all sub-units.") is not mistaken for a bare "Received,
 *  sir." acknowledgement. */
const SHORT_ACK_RE = /^(assalamualaikum|salam|noted|yes|no|ok(?:ay)?|received|copy|roger|understood|acknowledged|thank(?:s| you)?)[\s,.!]*(sir|ma'?am)?[\s,.!]*$/i;

/* Priority order per Part 4: permission, then consideration, then info —
 * checked in that order below.
 *
 * Phase 1.5 Part 2 hardening: every alternative below is anchored to an
 * actual REQUESTING construction (request/seek/may I/kindly/intend/
 * submitted for/is requested...), never a lone topic word on its own —
 * "permission", "permit", "authorized" and "decision"/"advice"/"judgement"
 * were previously bare alternatives here, which meant a purely
 * informational, already-decided, or negated sentence that merely
 * *mentions* the topic ("No permission is required for this transfer.",
 * "The gate pass was permitted by the duty officer yesterday.",
 * "Authorized personnel only are allowed inside.", "As per your advice,
 * the training was conducted successfully.", "The decision has already
 * been made and communicated.") was wrongly classified as permission/
 * consideration instead of info — exactly the "simple keyword matching"
 * failure mode Part 2 explicitly rules out. Verified against the dataset
 * of both specs' worked examples (still 100% correct below) plus the
 * false-positive sentences above (now correctly "info"). */
const PERMISSION_RE =
  /\b(request(?:ing)? (?:kind )?permission|seek(?:ing)? (?:kind )?permission|permission (?:is|was) (?:kindly )?(?:requested|sought)|permission to \w|may i\b|may we\b|kindly allow|allow me|kindly permit|kindly grant|i intend to|request(?:ing)? (?:kind )?authoriz\w*|seek(?:ing)? (?:kind )?authoriz\w*|request(?:ing)? approval|seek(?:ing)? approval)\b/i;
const CONSIDERATION_RE =
  /\b(opinion|your (?:kind )?view\b|consider(?:ation)?|recommend\w*|kindly consider|kindly reconsider|submitted for (?:your )?(?:kind )?(?:consideration|opinion|view)|may kindly be)\b/i;

/** Classifies a message body's closing intent. `bodyText` should already
 *  have the greeting line and everything from "Regards" onward stripped —
 *  see applyClosingLine, which does that before calling this. Exported
 *  separately so it's independently unit-testable against the request's own
 *  worked examples (Part 3/4/11). */
export function classifyClosingIntent(bodyText: string): ClosingIntent {
  const t = (bodyText || "").trim();
  if (!t) return null;
  if (SHORT_ACK_RE.test(t)) return null;
  if (PERMISSION_RE.test(t)) return "permission";
  if (CONSIDERATION_RE.test(t)) return "consideration";
  // Anything else with real content is a report/status/information message
  // by default (Part 2A covers this broadly — "reporting an event",
  // "reporting a status", etc. — without requiring the literal word
  // "inform" to appear).
  return "info";
}

/**
 * Ensures the message has exactly the right closing line (or none) in
 * exactly the right place. Idempotent: running it twice on its own output
 * produces the same result, since it always strips every existing closing
 * candidate before deciding what (if anything) belongs there.
 */
export function applyClosingLine(message: string): string {
  if (message == null) return message;
  if (!message.trim()) return message;

  const lines = message.split(/\r?\n/);

  // Strip every existing closing-line candidate first — right or wrong,
  // single or duplicated — the one correct line (if any applies) is
  // re-inserted at the guaranteed-correct position below (Part 9: no
  // duplicates, wrong lines replaced, not stacked).
  const withoutClosing = lines.filter((l) => !CLOSING_LINE_RE.test(l));

  // Classify from the body only: drop the greeting line (first line) and
  // everything from "Regards" onward (closing/signature) — the decision is
  // about what the message itself is doing, not its boilerplate.
  const regardsIdxForBody = withoutClosing.findIndex((l) => REGARDS_RE.test(l));
  const bodySlice = regardsIdxForBody === -1 ? withoutClosing : withoutClosing.slice(0, regardsIdxForBody);
  const bodyLines = bodySlice.filter((l, i) => !(i === 0 && isGreetingLine(l)));
  const bodyText = bodyLines.join(" ").trim();

  const intent = classifyClosingIntent(bodyText);
  if (!intent) {
    // Nothing forced — and any stray closing line already removed above, so
    // a message that shouldn't have one (Part 5) never keeps one just
    // because the AI added it unprompted.
    return withoutClosing.join("\n");
  }

  const correctLine = CLOSING_LINES[intent];
  const out = withoutClosing.slice();
  const regardsIdx = out.findIndex((l) => REGARDS_RE.test(l));

  if (regardsIdx === -1) {
    // "Regards" itself is missing (should not normally happen — the style
    // guide requires it) — append both so the required structure holds
    // regardless.
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    out.push("", correctLine, "Regards");
    return out.join("\n");
  }

  // Normalize to exactly one blank line between the message body and the
  // closing line, and no gap between the closing line and "Regards" —
  // regardless of how the AI happened to space things:
  //   [Main message]
  //   <blank line>
  //   For your kind ..., sir.
  //   Regards
  let insertAt = regardsIdx;
  while (insertAt > 0 && out[insertAt - 1].trim() === "") {
    out.splice(insertAt - 1, 1);
    insertAt--;
  }
  out.splice(insertAt, 0, "", correctLine);
  return out.join("\n");
}
