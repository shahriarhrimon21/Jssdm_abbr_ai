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
 * consideration, Sir." to a message that isn't a request).
 */

export type OutputMode = "text" | "whatsapp";

export const WHATSAPP_STYLE = {
  mandatory: {
    greeting:
      "Open with a greeting to the recipient, e.g. 'Assalamualaikum Sir,' (or whatever greeting form the user's own draft already uses — preserve their spelling/punctuation of it rather than normalizing it). Only default to 'Assalamualaikum Sir,' when generating from scratch with no greeting supplied.",
    body: "A concise, direct, professional, respectful main body. Information-dense, no filler conversational language ('I hope this message finds you well', 'I just wanted to reach out', etc.).",
    closing: "Some closing — see `closings` below for which one fits the message's purpose. Never omit a closing entirely, but never pad with more than one.",
  },
  conditional: {
    numbering:
      "When the message contains two or more distinct points, actions, or pieces of information, number them '1.', '2.', '3.' etc., one point per line, in the order they'd logically be read. A single-point or single-sentence message does not need numbering.",
    eventHeading:
      "For a schedule or list of timed events specifically, a short heading naming what the list is (e.g. 'Events Updt') and a date line is appropriate. Do not add an event heading or date line to a message that isn't an event/schedule list.",
    timeFormat:
      "Times are written in 24-hour military format with no colon and no am/pm, e.g. 0600, 1700, or as a range 0630-0720. Never convert to 6:00 AM style unless the user explicitly asked for that.",
    signature: "A sign-off name/initials/rank AFTER 'Regards' — only include this if the user has provided one; see `signature` handling below.",
  },
  closings: {
    request:
      "For a message asking for a decision, approval, or permission, close with a request-appropriate line before 'Regards' — e.g. 'For your kind consideration, Sir.' for something needing thought/review, or 'For your kind permission, Sir.' for something needing explicit authorization.",
    information: "For a message that's purely informational (a status update, an FYI, an answer to a question) a bare 'Regards' is enough — do not add a request-style line to an information-only message.",
    rule: "Pick the closing based on what the message is actually doing, not by default. Never mechanically append 'For your kind consideration, Sir.' to every message.",
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
 * so the model knows whether one is available to place after "Regards". */
export function buildWhatsAppGuidance(signature?: string): string {
  const m = WHATSAPP_STYLE.mandatory;
  const c = WHATSAPP_STYLE.conditional;
  const cl = WHATSAPP_STYLE.closings;
  const lines: string[] = [];
  lines.push(
    "The user has selected WHATSAPP mode: compose this as a military WhatsApp message in the style used by Bangladesh Armed Forces officers, " +
      "not as a formal letter, an email, or generic AI prose. This is a message-composition mode, not a formatting toggle.",
  );
  lines.push("Always true for this message: " + m.greeting + " " + m.body + " " + m.closing);
  lines.push(
    "Use only where it genuinely applies — do not force these in: " +
      c.numbering + " " + c.eventHeading + " " + c.timeFormat,
  );
  lines.push("Choosing the closing: " + cl.request + " " + cl.information + " " + cl.rule);
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
