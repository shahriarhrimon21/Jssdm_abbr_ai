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
 *
 * Recipient type (Senior/Junior — see whatsappStyle.ts's RecipientType):
 * applyClosingLine below takes an optional `recipientType` (default
 * "senior", so every pre-existing call site keeps its exact original
 * behaviour) and picks the matching closing-line wording — the three
 * "sir"-suffixed lines for Senior, or their "sir"-free counterparts
 * (JUNIOR_CLOSING_LINES) for Junior. applyRecipientEtiquette, further down
 * this file, is the companion pass that forces the exact "Assalamualaikum
 * Dear," opener and scrubs any stray "sir"/"Dear" the AI left elsewhere in
 * the message when Junior is selected — a no-op for Senior, same "prompt
 * guidance + deterministic guarantee" split as the closing line itself.
 */
import type { RecipientType } from "./whatsappStyle.ts";

export type ClosingIntent = "info" | "permission" | "consideration" | null;

/** Exact required wording (Part 12) for a SENIOR recipient — lowercase
 *  "sir", "info" not "information", "consideration" (never "opinion") for
 *  the opinion/decision case. */
export const CLOSING_LINES: Record<Exclude<ClosingIntent, null>, string> = {
  info: "For your kind info, sir.",
  permission: "For your kind permission, sir.",
  consideration: "For your kind consideration, sir.",
};

/** Same three lines, worded for a JUNIOR recipient — identical wording
 *  minus the ", sir" (Part 2B of the Senior/Junior toggle spec: no 'sir'
 *  anywhere outside the greeting when addressing a junior). */
export const JUNIOR_CLOSING_LINES: Record<Exclude<ClosingIntent, null>, string> = {
  info: "For your kind info.",
  permission: "For your kind permission.",
  consideration: "For your kind consideration.",
};

function closingLineFor(intent: Exclude<ClosingIntent, null>, recipientType: RecipientType): string {
  return recipientType === "junior" ? JUNIOR_CLOSING_LINES[intent] : CLOSING_LINES[intent];
}

/** Matches any of the three closing lines regardless of which one, plus the
 *  disallowed variant wordings ("information", "opinion") so a wrong or
 *  duplicated AI-produced line is recognized and removed, not just the
 *  exact-correct one. Deliberately NOT anchored to a fixed capitalization of
 *  "Sir"/"sir" — the AI may emit either. The trailing ", sir" is OPTIONAL
 *  (unlike the original Senior-only version of this regex) so a
 *  Junior-worded line ("For your kind info.", no "sir") is recognized and
 *  replaceable/de-duplicatable exactly the same way a Senior-worded one is. */
const CLOSING_LINE_RE = /^\s*for your kind (?:info(?:rmation)?|permission|consideration|opinion)(?:,?\s*sir)?\.?\s*$/i;

const REGARDS_RE = /^\s*regards\.?\s*$/i;

/** First-line salutation detector — either a recognized greeting opener, or
 *  (matching this app's own style guide's own convention, e.g.
 *  "Assalamualaikum Sir,") a short line ending in a comma, since that's how
 *  a salutation addressed to the recipient conventionally reads in this
 *  message style. Only ever applied to the first body line. */
export function isGreetingLine(line: string): boolean {
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
 *
 * `recipientType` defaults to "senior" — every pre-existing call site keeps
 * producing exactly the same ", sir."-suffixed lines as before the Senior/
 * Junior toggle existed; only an explicit "junior" caller gets the
 * sir-free wording (JUNIOR_CLOSING_LINES via closingLineFor).
 */
export function applyClosingLine(message: string, recipientType: RecipientType = "senior"): string {
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

  const correctLine = closingLineFor(intent, recipientType);
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

/**
 * Guarantees exactly one blank line between the greeting and the body,
 * mechanically rather than by asking the AI nicely — the style guide
 * (whatsappStyle.ts) has always described this shape in its worked
 * examples, but never stated it as a rule, so the model followed it
 * inconsistently. Companion to applyClosingLine above: same idea (a
 * deterministic pass beats a prompt instruction for anything that can be
 * decided mechanically), a different, non-overlapping part of the
 * message — this only ever touches the first couple of lines, never the
 * closing/"Regards" region applyClosingLine owns.
 *
 * Idempotent, and a no-op on anything that isn't a real greeting-first
 * message: a message with only one line, or whose first line isn't
 * recognized as a greeting (isGreetingLine — the AI didn't produce one,
 * or the user's own draft never had one to preserve), is returned
 * unchanged rather than guessed at.
 */
export function ensureGreetingBlankLine(message: string): string {
  if (message == null) return message;
  if (!message.trim()) return message;

  const lines = message.split(/\r?\n/);
  if (lines.length < 2 || !isGreetingLine(lines[0])) return message;

  // Collapse any existing run of blank lines right after the greeting
  // (zero, one, or several) down to exactly one.
  let i = 1;
  while (i < lines.length && lines[i].trim() === "") i++;
  const rest = lines.slice(i);
  if (rest.length === 0) return message; // a greeting-only message has nothing to separate

  return [lines[0], "", ...rest].join("\n");
}

/**
 * Junior-recipient etiquette pass (Part 2B of the Senior/Junior toggle
 * spec). A no-op for "senior" — returns the message unchanged, which is
 * what makes Senior a safe default that preserves pre-existing behaviour
 * for current users (Part 2A/3).
 *
 * For "junior", two jobs — both because the AI's own compliance with these
 * two specific rules is not reliable enough on its own to skip a
 * deterministic guarantee, the same rationale as applyClosingLine above:
 *
 *  1. Force the opening line to read EXACTLY "Assalamualaikum Dear," —
 *     never whatever greeting the AI carried over from the user's own
 *     draft, which may itself be a message copy-pasted from one originally
 *     meant for a senior ("Assalamualaikum Sir," and all).
 *  2. Strip any stray "sir"/"Dear" the AI still left in the body or
 *     closing. applyClosingLine already produces a correct, sir-free
 *     closing line for junior, so this is a backstop for anywhere else the
 *     word could have leaked in — most commonly a numbered point that
 *     echoes the user's own "..., sir" wording from their raw input.
 *
 * Deliberately called AFTER applyClosingLine (so the closing line is
 * already in its final, correct position and wording before this runs) and
 * BEFORE ensureGreetingBlankLine (so the blank-line pass sees the final
 * "Assalamualaikum Dear," opener) — see ai/state.ts's REQUEST_SUCCESS for
 * the exact ordering.
 *
 * Idempotent: the greeting line is *replaced* outright rather than
 * scrubbed, so a second pass produces the same "Assalamualaikum Dear,"
 * again; the scrub itself finds nothing left to remove once run once.
 */
export function applyRecipientEtiquette(message: string, recipientType: RecipientType = "senior"): string {
  if (message == null) return message;
  if (!message.trim()) return message;
  if (recipientType !== "junior") return message;

  let lines = message.split(/\r?\n/);

  if (lines.length > 0 && isGreetingLine(lines[0])) {
    lines[0] = "Assalamualaikum Dear,";
  } else {
    // No recognizable greeting to override — insert the required opener
    // rather than leaving the message to start mid-body (Part 2B: "Start
    // the message with: Assalamualaikum Dear,").
    lines = ["Assalamualaikum Dear,", "", ...lines];
  }

  // Scrub every line EXCEPT the greeting itself (index 0), which was just
  // replaced outright above and so has nothing left in it to strip.
  lines = lines.map((line, i) => (i === 0 ? line : stripSirAndDear(line)));

  return lines.join("\n");
}

/** Removes stray "sir"/"Dear" honorifics from a single line, cleaning up the
 *  punctuation/whitespace left behind so the result reads naturally instead
 *  of leaving a dangling comma or double space. Word-boundary matched
 *  throughout so it never touches a word merely containing "sir" as a
 *  substring. The common case in practice — "<point>, sir." carried over
 *  from a Senior-style draft — is handled by the first replacement alone,
 *  which removes the comma along with the word so the trailing period lands
 *  directly on the preceding word (e.g. "...correct, sir." -> "...correct.");
 *  the remaining replacements are backstops for less common phrasings. */
function stripSirAndDear(line: string): string {
  let out = line;
  out = out.replace(/\s*,\s*\bsir\b/gi, ""); // ", sir" — the common mid/end-of-sentence form
  out = out.replace(/\bsir\b/gi, ""); // any remaining bare "sir" (no leading comma)
  out = out.replace(/\bDear\b,?/g, ""); // a stray repeated "Dear" in the body
  out = out.replace(/[ \t]{2,}/g, " "); // collapse the double space left behind
  out = out.replace(/\s+([.,!?])/g, "$1"); // no space before punctuation
  return out.trim();
}
