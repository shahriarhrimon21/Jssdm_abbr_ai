import test from "node:test";
import assert from "node:assert/strict";
import { selectRelevantEntries, buildSuggestionSystemPrompt, parseSuggestionResponse } from "../suggestionPrompt.ts";

test("selectRelevantEntries finds approved entries that share a word with the message", () => {
  const entries = selectRelevantEntries("The officer will attend the meeting.");
  assert.ok(entries.length > 0, "expected at least one relevant entry");
  assert.ok(
    entries.some((e) => e.full.toLowerCase().includes("officer")),
    "expected an entry related to 'officer'",
  );
});

test("selectRelevantEntries returns nothing for an empty message", () => {
  assert.deepEqual(selectRelevantEntries(""), []);
  assert.deepEqual(selectRelevantEntries("   "), []);
});

test("selectRelevantEntries never returns duplicate abbr+full pairs and respects the limit", () => {
  const entries = selectRelevantEntries("The officer will move troops to the area for a meeting.", 5);
  assert.ok(entries.length <= 5);
  const keys = new Set(entries.map((e) => `${e.abbr}|${e.full}`));
  assert.equal(keys.size, entries.length, "no duplicate entries");
});

test("buildSuggestionSystemPrompt embeds the approved list and forbids invention", () => {
  const prompt = buildSuggestionSystemPrompt([{ full: "Officer", abbr: "offr" }]);
  assert.match(prompt, /Officer -> offr/);
  assert.match(prompt, /NEVER invent/);
  assert.match(prompt, /"suggestions"/);
});

test("buildSuggestionSystemPrompt handles an empty relevant-entries list without breaking", () => {
  const prompt = buildSuggestionSystemPrompt([]);
  assert.match(prompt, /none found/);
});

test("parseSuggestionResponse parses clean strict JSON", () => {
  const r = parseSuggestionResponse('{"suggestions": ["offr will attend.", "Offr to attend."]}');
  assert.equal(r.parseError, null);
  assert.deepEqual(r.suggestions, ["offr will attend.", "Offr to attend."]);
});

test("parseSuggestionResponse strips markdown code fences", () => {
  const r = parseSuggestionResponse('```json\n{"suggestions": ["a", "b", "c"]}\n```');
  assert.equal(r.parseError, null);
  assert.deepEqual(r.suggestions, ["a", "b", "c"]);
});

test("parseSuggestionResponse extracts JSON even with stray prose around it", () => {
  const r = parseSuggestionResponse('Here you go:\n{"suggestions": ["a", "b"]}\nHope that helps!');
  assert.equal(r.parseError, null);
  assert.deepEqual(r.suggestions, ["a", "b"]);
});

test("parseSuggestionResponse caps at 3 and dedupes", () => {
  const r = parseSuggestionResponse('{"suggestions": ["a", "a", "b", "c", "d"]}');
  assert.deepEqual(r.suggestions, ["a", "b", "c"]);
});

test("parseSuggestionResponse rejects empty/whitespace-only input without throwing", () => {
  assert.equal(parseSuggestionResponse("").parseError, "The AI returned an empty response.");
  assert.equal(parseSuggestionResponse("   ").parseError, "The AI returned an empty response.");
  assert.equal(parseSuggestionResponse(null).parseError, "The AI returned an empty response.");
  assert.equal(parseSuggestionResponse(undefined).parseError, "The AI returned an empty response.");
});

test("parseSuggestionResponse rejects malformed JSON without throwing", () => {
  const r = parseSuggestionResponse("{not: valid json at all");
  assert.equal(r.suggestions.length, 0);
  assert.match(r.parseError!, /could not be read as valid JSON/);
});

test("parseSuggestionResponse rejects a response with the wrong shape (no suggestions array)", () => {
  const r1 = parseSuggestionResponse('{"result": "just a string"}');
  assert.match(r1.parseError!, /not in the expected format/);
  const r2 = parseSuggestionResponse("[1, 2, 3]");
  assert.match(r2.parseError!, /not in the expected format/);
  const r3 = parseSuggestionResponse('{"suggestions": "not an array"}');
  assert.match(r3.parseError!, /not in the expected format/);
});

test("parseSuggestionResponse rejects a response whose array contains no usable strings", () => {
  const r = parseSuggestionResponse('{"suggestions": [123, null, ""]}');
  assert.equal(r.suggestions.length, 0);
  assert.match(r.parseError!, /did not contain any usable suggestions/);
});

test("parseSuggestionResponse trims whitespace from each suggestion", () => {
  const r = parseSuggestionResponse('{"suggestions": ["  padded text  ", "clean"]}');
  assert.deepEqual(r.suggestions, ["padded text", "clean"]);
});
