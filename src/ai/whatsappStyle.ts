/**
 * Data-driven configuration for "Military WhatsApp Message Mode".
 *
 * This is deliberately a CONFIG OBJECT, not a hard-coded template or a
 * paragraph baked into a prompt string. buildWhatsAppGuidance() below reads
 * this structure and renders it into system-prompt guidance. If the style
 * ever needs refining (a different closing convention, a new abbreviation
 * observed in real messages, etc.), it should mean editing this file's data,
 * not rewriting prose scattered across prompts.ts or the component.
 *
 * The three sample messages this was derived from vary in almost every
 * "conditional" respect (one has a numbered event log with a date heading,
 * one is a short question with no numbering, one is a two-point request)
 * while agreeing on the same small set of things every message shares. That
 * split is captured explicitly below as `mandatory` vs `conditional` so the
 * AI is told what's always true separately from what depends on context —
 * see Part 22 of the request this was built against. The model is
 * instructed to use conditional components only when the message actually
 * calls for them, never to force them in (e.g. never append "For your kind
 * info, sir." to a message that's a bare acknowledgement).
 *
 * Closing-line policy: this file's `closings` guidance is the AI's first
 * pass only. The AUTHORITATIVE, guaranteed-correct pass is deterministic —
 * see whatsappClosing.ts's applyClosingLine(), run on every WhatsApp-mode AI
 * response in ai/state.ts's REQUEST_SUCCESS — which classifies the
 * message's intent itself and corrects/inserts/removes the closing line
 * regardless of what the AI produced, per the "For your kind..." closing
 * line spec this was built against.
 *
 * Recipient type (Senior/Junior — see `junior` below and the `recipientType`
 * param threaded through buildSystemPrompt/buildWhatsAppGuidance) follows the
 * exact same two-pass pattern: this file's `junior` guidance is the AI's
 * first attempt, and whatsappClosing.ts's applyRecipientEtiquette() is the
 * deterministic guarantee — forcing the exact "Assalamualaikum Dear," opener
 * and scrubbing any stray "sir"/"Dear" the AI left behind — run right after
 * applyClosingLine in ai/state.ts's REQUEST_SUCCESS. "Senior" is a no-op for
 * both passes, which is what makes it the safe default (Part 3: existing
 * behaviour for current users is unchanged unless Junior is explicitly
 * selected).
 */

export type OutputMode = "text" | "whatsapp";
export type RecipientType = "senior" | "junior";

export const WHATSAPP_STYLE = {
  mandatory: {
    greeting:
      "Open with a greeting to the recipient, e.g. 'Assalamualaikum Sir,' (or whatever greeting form the user's own draft already uses — preserve their spelling/punctuation of it rather than normalizing it). Only default to 'Assalamualaikum Sir,' when generating from scratch with no greeting supplied.",
    body: "A concise, direct, professional, respectful main body. Information-dense, no filler conversational language ('I hope this message finds you well', 'I just wanted to reach out', etc.).",
    closing:
      "A closing appropriate to the message's purpose — see `closings` below. 'Regards' by itself is always the final line; when one of the three 'For your kind...' lines applies (see `closings`), it goes on its own line immediately before 'Regards', never after it and never mid-message. Never omit 'Regards', and never include more than one 'For your kind...' line.",
  },
  /**
   * Wording-fidelity rule, added after real usage showed the model
   * over-formalizing already-clear military phrasing (e.g. rewriting "man
   * and materials are okay" as "all personnel and materials are safe") and,
   * separately, silently dropping a trailing point that didn't fit its own
   * summary of the message. Both are correctness bugs, not style
   * preferences — the model doesn't get to paraphrase away the user's own
   * wording, and it doesn't get to decide a line wasn't worth keeping.
   * Stated as a firm rule with a worked example for the same reason
   * `numbering` below is: a soft "try to preserve wording" suggestion was
   * followed inconsistently, a concrete before/after with real numbers
   * moves compliance. Applies regardless of recipientType — this is a
   * preservation-of-meaning fix, not a Senior/Junior tone difference.
   */
  preservation: {
    rule:
      "REQUIRED wording fidelity: when the user's own military wording is already clear, do not paraphrase or formalize it further — fix only grammar, spelling, punctuation, capitalization and structure/formatting. Keep the user's own terms close to as written (e.g. 'firers', 'ammo', 'Kote', 'ammo guard', 'firing') rather than swapping them for generic corporate-sounding alternatives — e.g. 'man and materials are okay/correct' must stay close to 'man and materials are all correct', NOT become 'all personnel and materials are safe'. Do not omit any meaningful information from the input: every distinct reporting point in the user's message must appear in the output, each as its own numbered item where numbering applies — never silently drop, merge away, or summarize past a line of information, however short.",
    example:
      "Example — input:\n" +
      "after firing man and materials are okay, sir\n" +
      "Total Firer : 106\n" +
      "Total fired ammo: 1108\n" +
      "Kote and ammo guard are sealed ,sir\n" +
      "MUST render as FOUR numbered points — nothing dropped, wording kept close to the original, not over-formalized:\n" +
      "1. After firing, man and materials are all correct, sir.\n" +
      "2. Total firers: 106.\n" +
      "3. Total ammo fired: 1108.\n" +
      "4. Kote and ammo guard are sealed, sir.\n" +
      "This is WRONG on two counts: rewriting point 1 as \"All personnel and materials are safe\" (over-formalized, drifted from the user's own wording), and dropping point 4 entirely (omitted information).",
  },
  conditional: {
    eventHeading:
      "For a schedule or list of timed events specifically, a short heading naming what the list is (e.g. 'Events Updt') and a date line is appropriate. Do not add an event heading or date line to a message that isn't an event/schedule list.",
    timeFormat:
      "Times are written in 24-hour military format with no colon and no am/pm, e.g. 0600, 1700, or as a range 0630-0720. Never convert to 6:00 AM style unless the user explicitly asked for that.",
    signature: "A sign-off name/initials/rank AFTER 'Regards' — only include this if the user has provided one; see `signature` handling below.",
  },
  closings: {
    info: "If the message is reporting, informing, or updating the recipient (a status report, an FYI, a completed/ongoing event, an answer that isn't itself a request) close with exactly: 'For your kind info, sir.' immediately before 'Regards'.",
    permission:
      "If the message is asking the recipient to grant, authorize, or permit something (movement, leave, attendance, use of a resource, or a proposed action awaiting explicit go-ahead) close with exactly: 'For your kind permission, sir.' immediately before 'Regards'.",
    consideration:
      "If the message is asking for the recipient's opinion, view, decision, or consideration of a proposal/request/option close with exactly: 'For your kind consideration, sir.' immediately before 'Regards'.",
    priority:
      "When a message could plausibly read as more than one of these, decide by its overall purpose, not an isolated keyword, using this priority: permission first, then consideration, then info.",
    omission:
      "Some messages genuinely need none of these — a bare acknowledgement, a greeting, 'Noted, sir.', 'Received, sir.', a very short reply. Do not add a request-style closing line to a message like that.",
    exactWording:
      "Use exactly one of the three phrases above, worded exactly as shown (lowercase 'sir'; 'info', never 'information'; 'consideration', never 'opinion', for the opinion/decision case). Never use more than one closing line, and never place it after 'Regards' or in the middle of the message.",
  },
  /**
   * Recipient = Junior (see RecipientType). Only rendered when
   * recipientType is "junior" — Senior keeps using `mandatory.greeting` and
   * `closings` above unchanged, which is the whole point of "Senior
   * preserves current behaviour" (Part 2A of the toggle spec).
   *
   * The greeting/no-honorifics rules here are the AI's first attempt only;
   * whatsappClosing.ts's applyRecipientEtiquette() is what actually
   * guarantees the exact opener and scrubs any stray "sir"/"Dear" the model
   * still produces, the same "prompt guidance + deterministic guarantee"
   * split used for the closing line itself (see the file header comment).
   */
  junior: {
    greeting:
      "This message is addressed to a JUNIOR recipient (someone the user outranks or is senior to), not a senior officer. Open with exactly 'Assalamualaikum Dear,' as the first line — always, regardless of how the user's own draft opens. If the user's raw input carries a 'Sir'-style greeting or stray 'sir' references (e.g. copy-pasted from a message that was originally meant for a senior), do NOT preserve those — they do not apply to a junior recipient.",
    noHonorifics:
      "After that opening line, do not use the word 'sir' anywhere else in the message — not after a numbered point, not in the closing — and do not repeat 'Dear' again anywhere in the body. One honorific, in the greeting only, nothing else. Never produce phrases like '..., sir.', 'For your kind info, sir.', or 'Dear, ...' mid-message.",
    closings: {
      info: "If the message is reporting, informing, or updating the recipient close with exactly: 'For your kind info.' immediately before 'Regards' — no 'sir'.",
      permission:
        "If the message is asking the recipient to grant, authorize, or permit something close with exactly: 'For your kind permission.' immediately before 'Regards' — no 'sir'.",
      consideration:
        "If the message is asking for the recipient's opinion, view, decision, or consideration close with exactly: 'For your kind consideration.' immediately before 'Regards' — no 'sir'.",
      omission:
        "Some messages genuinely need none of these — a bare acknowledgement, a greeting, 'Noted.', 'Received.', a very short reply. Do not add a request-style closing line to a message like that.",
      exactWording:
        "Use exactly one of the three phrases above, worded exactly as shown, with NO 'sir' at the end ('info', never 'information'; 'consideration', never 'opinion'). Never use more than one closing line, and never place it after 'Regards' or in the middle of the message.",
    },
  },
  /**
   * Split out of `conditional` and given its own rendered line (see
   * buildWhatsAppGuidance) — previously folded into one sentence together
   * with eventHeading/timeFormat, softly worded as "use only where it
   * applies", which the model followed inconsistently. This is still
   * conditional (a single-point message genuinely doesn't need it), but
   * stated as a firm rule with a worked example rather than a suggestion,
   * since that's what actually moves compliance on formatting rules like
   * this one.
   */
  numbering: {
    rule:
      "REQUIRED numbering: when the message body contains two or more distinct points, actions, or pieces of information, you MUST use numbered list formatting — '1.', '2.', '3.' etc., one point per line, in the order they'd logically be read — never run them together as one paragraph or separate them with commas/semicolons instead. A single-point or single-sentence message does not need numbering.",
    example:
      'Example — "Inform sir the patrol reached the location at 1600, there were no incidents, and the unit is awaiting further orders" has three distinct points and MUST be rendered as:\n' +
      "1. Patrol reached the location at 1600 hrs.\n" +
      "2. No incidents reported en route.\n" +
      "3. Awaiting further instructions.\n" +
      "— not as one run-on sentence.",
  },
  toneNotes: [
    "Concise military communication, not extreme SMS-shorthand — the samples read as something a serving officer would actually type on WhatsApp, not a chat abbreviation dump.",
    "Do not maximize abbreviation density for its own sake. Plain English words are fine; only use a military abbreviation where it's natural and the style samples support it.",
    "Never invent facts: a name, rank, unit, date, time, location, appointment, event, person, reason, or reference number that the user didn't supply must not be invented. If something is missing and needed, either leave an obvious placeholder (e.g. '[unit]'), ask the user, or omit it — do not guess.",
  ],
  signatureHandling:
    "The user may supply a signature (e.g. 'BM' or 'Maj Hemel') separately from the message content. If they have, place it on its own line after 'Regards'. If they have not supplied one, end at 'Regards' with no invented name, rank, or appointment underneath it.",
  formattingRules: [
    "Plain text only — no markdown, no bullet characters other than the '1.' '2.' numbering described above, no bold/italic markers.",
    "Keep line breaks meaningful: greeting on its own line, each numbered point on its own line, closing and 'Regards'/signature on their own line(s) at the end.",
    "The output should be ready to paste directly into WhatsApp and send as-is — no bracketed meta-commentary, no 'Here is your message:' preamble, no explanation of what was changed.",
  ],
} as const;

/** Renders the WHATSAPP_STYLE config into prose guidance for the system
 * prompt. Takes the user's own signature (never invented on their behalf)
 * so the model knows whether one is available to place after "Regards".
 *
 * `recipientType` defaults to "senior" so every existing call site (and
 * every existing test) that doesn't pass it keeps producing exactly the
 * same guidance as before Junior mode existed — see RecipientType's header
 * comment for why Senior is the safe, behaviour-preserving default. */
export function buildWhatsAppGuidance(signature?: string, recipientType: RecipientType = "senior"): string {
  const m = WHATSAPP_STYLE.mandatory;
  const c = WHATSAPP_STYLE.conditional;
  const isJunior = recipientType === "junior";
  const cl = isJunior ? WHATSAPP_STYLE.junior.closings : WHATSAPP_STYLE.closings;
  const lines: string[] = [];
  lines.push(
    "The user has selected WHATSAPP mode: compose this as a military WhatsApp message in the style used by Bangladesh Armed Forces officers, " +
      "not as a formal letter, an email, or generic AI prose. This is a message-composition mode, not a formatting toggle.",
  );
  lines.push(WHATSAPP_STYLE.preservation.rule);
  lines.push(WHATSAPP_STYLE.preservation.example);
  if (isJunior) {
    lines.push(WHATSAPP_STYLE.junior.greeting);
    lines.push(WHATSAPP_STYLE.junior.noHonorifics);
    lines.push("Always true for this message: " + m.body + " " + m.closing);
  } else {
    lines.push("Always true for this message: " + m.greeting + " " + m.body + " " + m.closing);
  }
  lines.push(WHATSAPP_STYLE.numbering.rule);
  lines.push(WHATSAPP_STYLE.numbering.example);
  lines.push("Use only where it genuinely applies — do not force these in: " + c.eventHeading + " " + c.timeFormat);
  lines.push(
    "Choosing the closing" +
      (isJunior ? " (no 'sir' — this recipient is a junior)" : "") +
      ": " +
      cl.info +
      " " +
      cl.permission +
      " " +
      cl.consideration +
      " " +
      WHATSAPP_STYLE.closings.priority +
      " " +
      cl.omission +
      " " +
      cl.exactWording,
  );
  lines.push(...WHATSAPP_STYLE.toneNotes);
  lines.push(
    signature && signature.trim()
      ? `The user's signature is "${signature.trim()}" — place it on its own line after "Regards".`
      : WHATSAPP_STYLE.signatureHandling,
  );
  lines.push(...WHATSAPP_STYLE.formattingRules);
  lines.push(
    "This mode affects wording and structure only. It never decides what counts as an authorized JSSDM abbreviation — that is still decided " +
      "exclusively by this app's own JSSDM engine when the user sends the result to Abbreviation.",
  );
  return lines.join("\n");
}
