import test from "node:test";
import assert from "node:assert/strict";
import { buildWhatsAppGuidance } from "../whatsappStyle.ts";
import { buildSystemPrompt } from "../prompts.ts";

test("buildWhatsAppGuidance mentions the mandatory structural elements", () => {
  const g = buildWhatsAppGuidance();
  assert.match(g, /greeting/i);
  assert.match(g, /numbered|numbering/i);
  assert.match(g, /24-hour|military format|0600/);
  assert.match(g, /Regards/);
});

test("buildWhatsAppGuidance never forces the event-heading or a closing line", () => {
  const g = buildWhatsAppGuidance();
  assert.match(g, /do not add an event heading/i);
  assert.match(g, /do not add a request-style closing line/i);
});

test("buildWhatsAppGuidance describes all three closing phrases with exact required wording, in priority order", () => {
  const g = buildWhatsAppGuidance();
  assert.match(g, /For your kind info, sir\./);
  assert.match(g, /For your kind permission, sir\./);
  assert.match(g, /For your kind consideration, sir\./);
  assert.match(g, /permission first, then consideration, then info/i);
  assert.doesNotMatch(g, /For your kind information, sir/i, "must never use the disallowed 'information' wording");
  assert.doesNotMatch(g, /For your kind opinion, sir/i, "must never use the disallowed 'opinion' wording");
});

test("buildWhatsAppGuidance instructs never to invent facts", () => {
  const g = buildWhatsAppGuidance();
  assert.match(g, /never invent/i);
  assert.match(g, /name, rank, unit, date, time, location/i);
});

test("buildWhatsAppGuidance places a user-supplied signature verbatim, never invents one when absent", () => {
  const withSig = buildWhatsAppGuidance("Capt Rahman");
  assert.match(withSig, /The user's signature is "Capt Rahman"/);
  const withoutSig = buildWhatsAppGuidance();
  assert.doesNotMatch(withoutSig, /The user's signature is/, "must not claim a signature exists when none was supplied");
  assert.doesNotMatch(withoutSig, /Capt Rahman/);
  assert.match(withoutSig, /have not supplied one/i);
});

test("buildWhatsAppGuidance keeps the JSSDM engine as the abbreviation authority even in WhatsApp mode", () => {
  const g = buildWhatsAppGuidance();
  assert.match(g, /never decides what counts as an authorized JSSDM abbreviation/i);
});

test("buildSystemPrompt in text mode (default/omitted outputMode) contains no WhatsApp guidance", () => {
  const p1 = buildSystemPrompt("generate", "Neutral");
  const p2 = buildSystemPrompt("generate", "Neutral", undefined, "text");
  assert.doesNotMatch(p1, /WhatsApp/);
  assert.doesNotMatch(p2, /WhatsApp/);
});

test("buildSystemPrompt in whatsapp mode appends the WhatsApp guidance without dropping the base guardrail", () => {
  const p = buildSystemPrompt("generate", "Neutral", undefined, "whatsapp", "BM");
  assert.match(p, /NOT the source of truth for JSSDM abbreviations/, "base guardrail must still be present");
  assert.match(p, /WHATSAPP mode/);
  assert.match(p, /"BM"/);
});

test("buildSystemPrompt whatsapp mode still carries the check-vs-generate mode instruction", () => {
  const check = buildSystemPrompt("check", "Neutral", undefined, "whatsapp");
  const gen = buildSystemPrompt("generate", "Neutral", undefined, "whatsapp");
  assert.match(check, /Check & Polish/);
  assert.match(gen, /Mode: Generate/);
});
