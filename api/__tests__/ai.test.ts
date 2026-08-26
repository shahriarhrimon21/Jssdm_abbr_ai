/**
 * Guards the Vercel entry point's (req,res)->Request/Response adapter
 * (api/ai.ts). The request-handling logic itself is already fully covered
 * by netlify/functions/__tests__/ai.test.ts, since both entry points call
 * the exact same ../_lib/handler.ts — what's specific to this file is
 * whether the adapter correctly translates a Vercel-shaped (req, res) call
 * into the Request the shared handler expects, and its Response back into
 * the res.status()/setHeader()/send() calls Vercel's Node runtime needs.
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
  await handler({ method: "GET", url: "/api/ai", headers: { host: "localhost" } }, res);
  assert.equal(state.statusCode, 405);
  assert.equal(JSON.parse(state.body).ok, false);
});

test("api/ai.ts adapter: forwards a POST body to the shared handler and relays its response (missing systemPrompt -> 400)", async () => {
  const { res, state } = mockRes();
  await handler(
    {
      method: "POST",
      url: "/api/ai",
      headers: { host: "localhost", "content-type": "application/json" },
      body: { provider: "gemini", messages: [{ role: "user", content: "hi" }] }, // no systemPrompt
    },
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
        url: "/api/ai",
        headers: { host: "localhost", "content-type": "application/json" },
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
  await handler({ method: "GET", url: "/api/ai", headers: { host: "localhost" } }, res);
  assert.equal(state.headers["content-type"], "application/json");
});
