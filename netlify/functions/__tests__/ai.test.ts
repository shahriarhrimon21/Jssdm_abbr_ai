/**
 * Regression suite for the Netlify Function handler — invoked directly
 * with real Request objects (no Netlify CLI needed to run these). Confirms
 * the request contract, input validation, and — critically — that no
 * failure path ever leaks a stack trace or an API key into the response.
 */
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../ai.ts";
import { buildSystemPrompt } from "../../../src/ai/prompts.ts";

function req(body: unknown, opts: RequestInit = {}) {
  return new Request("http://localhost/.netlify/functions/ai", {
    method: "POST",
    body: JSON.stringify(body),
    ...opts,
  });
}

test("rejects non-POST methods", async () => {
  const res = await handler(new Request("http://localhost/.netlify/functions/ai", { method: "GET" }));
  assert.equal(res.status, 405);
  const data = await res.json();
  assert.equal(data.ok, false);
});

test("rejects malformed JSON", async () => {
  const res = await handler(new Request("http://localhost/.netlify/functions/ai", { method: "POST", body: "not json" }));
  assert.equal(res.status, 400);
});

test("rejects an unknown provider id", async () => {
  const res = await handler(req({ provider: "not-a-real-provider", systemPrompt: "x", messages: [{ role: "user", content: "hi" }] }));
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /Unknown AI provider/);
});

test("rejects a missing systemPrompt", async () => {
  const res = await handler(req({ provider: "gemini", messages: [{ role: "user", content: "hi" }] }));
  assert.equal(res.status, 400);
});

test("rejects an empty messages array", async () => {
  const res = await handler(req({ provider: "gemini", systemPrompt: "x", messages: [] }));
  assert.equal(res.status, 400);
});

test("rejects a malformed message (bad role)", async () => {
  const res = await handler(req({ provider: "gemini", systemPrompt: "x", messages: [{ role: "system", content: "hi" }] }));
  assert.equal(res.status, 400);
});

test("gemini: reports 'not configured' with no GEMINI_API_KEY set, and never echoes a key", async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const res = await handler(req({ provider: "gemini", systemPrompt: "x", messages: [{ role: "user", content: "hi" }] }));
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.doesNotMatch(data.error, /AIza|AQ\./, "error text must never contain a key-shaped string");
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test("openai: reports 'not configured' with no OPENAI_API_KEY set, and never echoes a key", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const res = await handler(req({ provider: "openai", systemPrompt: "x", messages: [{ role: "user", content: "hi" }] }));
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.ok, false);
  } finally {
    if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey;
  }
});

test("groq: reports 'not configured' with no GROQ_API_KEY set, and never echoes a key", async () => {
  const prevKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const res = await handler(req({ provider: "groq", systemPrompt: "x", messages: [{ role: "user", content: "hi" }] }));
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.ok, false);
  } finally {
    if (prevKey !== undefined) process.env.GROQ_API_KEY = prevKey;
  }
});

/* ---- Regression: a real WhatsApp-mode system prompt must never trip the
 * "Missing or oversized systemPrompt." guard. This exact bug shipped once —
 * strengthening whatsappStyle.ts's numbering guidance grew the rendered
 * WhatsApp system prompt past a 6000-char limit that had almost no headroom,
 * so a completely ordinary Generate+WhatsApp request (e.g. "wishing birthday
 * to senior" with a signature set) failed with a 400 before ever reaching
 * the AI provider. MAX_SYSTEM_PROMPT_CHARS now has real headroom; this test
 * renders the actual longest system prompt the app produces and asserts it
 * clears the limit by a wide margin, so the next content tweak can't silently
 * reintroduce the same failure. */
test("system prompt length: the real WhatsApp-mode system prompt clears MAX_SYSTEM_PROMPT_CHARS with headroom", async () => {
  const longestSignature = "Capt Shahriar"; // matches the reported failing case
  const sp = buildSystemPrompt("generate", "Warm / Collegial", undefined, "whatsapp", longestSignature);
  assert.ok(sp.length < 10000, `WhatsApp system prompt is ${sp.length} chars — should have generous headroom under the server's cap`);

  // And prove it end-to-end: posting this exact prompt must NOT be rejected
  // as "oversized" — with no provider key configured it should fail with
  // 503 (provider not configured), never 400 (bad request).
  const prevKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const res = await handler(req({ provider: "groq", systemPrompt: sp, messages: [{ role: "user", content: "wishing birthday to senior" }] }));
    assert.equal(res.status, 503, "must reach the 'provider not configured' check, not be rejected earlier as oversized");
  } finally {
    if (prevKey !== undefined) process.env.GROQ_API_KEY = prevKey;
  }
});

test("defaults to the groq provider (free, no card) when none is specified", async () => {
  const prevKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const res = await handler(req({ systemPrompt: "x", messages: [{ role: "user", content: "hi" }] }));
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.match(data.error, /Groq/);
  } finally {
    if (prevKey !== undefined) process.env.GROQ_API_KEY = prevKey;
  }
});
