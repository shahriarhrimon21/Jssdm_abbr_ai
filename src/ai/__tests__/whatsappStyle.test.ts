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

/* ---- Wording-fidelity guidance (preservation) — always present in
 * WhatsApp mode, regardless of recipientType. ---- */

test("buildWhatsAppGuidance instructs against over-formalizing already-clear wording, with the worked example", () => {
  const g = buildWhatsAppGuidance();
  assert.match(g, /do not paraphrase or formalize/i);
  assert.match(g, /man and materials are all correct/i);
  // The "all personnel and materials are safe" phrasing does appear in the
  // guidance — but only inside the worked example, explicitly labelled as
  // the WRONG output ("This is WRONG on two counts..."), never as an
  // instructed target. Pin that labelling down instead of asserting the
  // substring is absent entirely.
  assert.match(g, /is WRONG on two counts.*all personnel and materials are safe/is);
  assert.match(g, /do not omit any meaningful information/i);
});

/* ---- Senior/Junior recipient type ---- */

test("buildWhatsAppGuidance defaults to Senior behaviour when recipientType is omitted", () => {
  const withDefault = buildWhatsAppGuidance(undefined);
  const explicitSenior = buildWhatsAppGuidance(undefined, "senior");
  assert.equal(withDefault, explicitSenior);
  assert.match(withDefault, /For your kind info, sir\./);
  assert.doesNotMatch(withDefault, /Assalamualaikum Dear,/);
});

test("buildWhatsAppGuidance in Junior mode requires the exact 'Assalamualaikum Dear,' opener and forbids 'sir'/'Dear' elsewhere", () => {
  const g = buildWhatsAppGuidance(undefined, "junior");
  assert.match(g, /Assalamualaikum Dear,/);
  assert.match(g, /JUNIOR recipient/);
  assert.match(g, /do not use the word 'sir' anywhere else/i);
  assert.match(g, /do not repeat 'Dear' again/i);
});

test("buildWhatsAppGuidance in Junior mode uses sir-free closing wording, never the Senior 'sir' phrasing as an instructed line", () => {
  const g = buildWhatsAppGuidance(undefined, "junior");
  assert.match(g, /close with exactly: 'For your kind info\.'/);
  assert.match(g, /close with exactly: 'For your kind permission\.'/);
  assert.match(g, /close with exactly: 'For your kind consideration\.'/);
  // The Senior 'sir'-suffixed phrasing does appear once, but only inside the
  // "never produce phrases like" negative example, not as an instructed
  // closing line — pin down the closings section specifically instead of
  // asserting the substring is absent from the whole guidance string.
  assert.doesNotMatch(g, /close with exactly: 'For your kind info, sir/);
  assert.doesNotMatch(g, /close with exactly: 'For your kind permission, sir/);
  assert.doesNotMatch(g, /close with exactly: 'For your kind consideration, sir/);
});

test("buildSystemPrompt threads recipientType through to the WhatsApp guidance", () => {
  const senior = buildSystemPrompt("generate", "Neutral", undefined, "whatsapp", undefined, "senior");
  const junior = buildSystemPrompt("generate", "Neutral", undefined, "whatsapp", undefined, "junior");
  assert.match(senior, /SENIOR/);
  assert.match(junior, /JUNIOR/);
  assert.match(junior, /Assalamualaikum Dear,/);
});

test("buildSystemPrompt defaults recipientType to senior when omitted (Part 3: existing behaviour preserved)", () => {
  const omitted = buildSystemPrompt("generate", "Neutral", undefined, "whatsapp");
  const explicit = buildSystemPrompt("generate", "Neutral", undefined, "whatsapp", undefined, "senior");
  assert.equal(omitted, explicit);
});

test("buildSystemPrompt carries a Senior/Junior tone instruction even in text mode (no WhatsApp guidance)", () => {
  const seniorText = buildSystemPrompt("generate", "Neutral", undefined, "text", undefined, "senior");
  const juniorText = buildSystemPrompt("generate", "Neutral", undefined, "text", undefined, "junior");
  assert.doesNotMatch(seniorText, /WhatsApp/);
  assert.doesNotMatch(juniorText, /WhatsApp/);
  assert.match(seniorText, /SENIOR/);
  assert.match(juniorText, /JUNIOR/);
});
