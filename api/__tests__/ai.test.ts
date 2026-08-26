/**
 * Guards the Vercel entry point's (req,res)->Request/Response adapter
 * (api/ai.ts). The request-handling logic itself is already fully covered
 * by netlify/functions/__tests__/ai.test.ts, since both entry points call
 * the exact same ../_lib/handler.ts — what's specific to this file is
 * whether the adapter correctly translates a Vercel-shaped (req, res) call
 * into the Request the shared handler expects, relays its Response back
 * correctly, and — the thing that broke once already — never lets an
 * unexpected throw escape as Vercel's generic non-JSON error page instead
 * of a proper { ok: false, error } body.
 *
 * mockRes() below stands in for the real Vercel ServerResponse-like object
 * (status/setHeader/send) — this test never imports @vercel/node, so the
 * project needs no new dependency just to exercise this file.
 */
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../ai.ts";

function mockRes() {
  const state: { statusCode: number; headers: Record<string, string>; body: string } = {
    statusCode: 0,
    headers: {},
    body: "",
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      state.headers[key] = value;
    },
    send(body: string) {
      state.body = body;
    },
  };
  return { res, state };
}

test("api/ai.ts adapter: rejects a GET request the same way the shared handler does (405)", async () => {
  const { res, state } = mockRes();
  await handler({ method: "GET" }, res);
  assert.equal(state.statusCode, 405);
  assert.equal(JSON.parse(state.body).ok, false);
});

test("api/ai.ts adapter: forwards a POST body to the shared handler and relays its response (missing systemPrompt -> 400)", async () => {
  const { res, state } = mockRes();
  await handler(
    { method: "POST", body: { provider: "gemini", messages: [{ role: "user", content: "hi" }] } }, // no systemPrompt
    res,
  );
  assert.equal(state.statusCode, 400);
  const data = JSON.parse(state.body);
  assert.equal(data.ok, false);
  assert.match(data.error, /systemPrompt/);
});

test("api/ai.ts adapter: a well-formed request reaches the provider-configured check (503, not rejected earlier)", async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const { res, state } = mockRes();
    await handler(
      {
        method: "POST",
        body: { provider: "gemini", systemPrompt: "You are a helpful assistant.", messages: [{ role: "user", content: "hi" }] },
      },
      res,
    );
    assert.equal(state.statusCode, 503);
    const data = JSON.parse(state.body);
    assert.equal(data.ok, false);
    assert.match(data.error, /Gemini/);
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test("api/ai.ts adapter: response headers from the shared handler are relayed (Content-Type)", async () => {
  const { res, state } = mockRes();
  await handler({ method: "GET" }, res);
  assert.equal(state.headers["Content-Type"], "application/json");
});

test("api/ai.ts adapter: handles req.body already parsed as an object (the common Vercel case)", async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const { res, state } = mockRes();
    await handler({ method: "POST", body: { provider: "gemini", systemPrompt: "hi", messages: [{ role: "user", content: "hi" }] } }, res);
    assert.equal(state.statusCode, 503, "an object body should be handled identically to the primary path");
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test("api/ai.ts adapter: handles req.body arriving as a raw JSON string instead of a parsed object", async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const { res, state } = mockRes();
    const raw = JSON.stringify({ provider: "gemini", systemPrompt: "hi", messages: [{ role: "user", content: "hi" }] });
    await handler({ method: "POST", body: raw }, res);
    assert.equal(state.statusCode, 503, "a pre-stringified body must not be double-stringified into invalid JSON");
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test("api/ai.ts adapter: handles req.body arriving as a Buffer instead of a parsed object", async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const { res, state } = mockRes();
    const raw = Buffer.from(JSON.stringify({ provider: "gemini", systemPrompt: "hi", messages: [{ role: "user", content: "hi" }] }), "utf-8");
    await handler({ method: "POST", body: raw }, res);
    assert.equal(state.statusCode, 503, "a Buffer body must be decoded, not stringified as a Buffer object literal");
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
  }
});

test("api/ai.ts adapter: req with no method/body at all (malformed call) still returns valid JSON, never throws uncaught", async () => {
  const { res, state } = mockRes();
  await assert.doesNotReject(handler({}, res));
  assert.ok(state.statusCode >= 400, "should be an error status, not a silent success");
  const data = JSON.parse(state.body); // must not throw — proves the body is valid JSON
  assert.equal(data.ok, false);
});
