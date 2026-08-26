/**
 * callAI() itself is a thin fetch() wrapper, so these tests stub
 * globalThis.fetch rather than making a real network call — that keeps the
 * suite offline-runnable, and lets the abort/error branches (hard to
 * reliably trigger against a real server) be exercised directly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { callAI } from "../client.ts";

function withFetch(fn: typeof fetch, run: () => Promise<void>) {
  const original = (globalThis as any).fetch;
  (globalThis as any).fetch = fn;
  return run().finally(() => {
    (globalThis as any).fetch = original;
  });
}

test("callAI returns the AI text on a successful response", async () => {
  await withFetch(
    (async () => new Response(JSON.stringify({ ok: true, text: "hello" }), { status: 200 })) as any,
    async () => {
      const r = await callAI({ systemPrompt: "sp", messages: [{ role: "user", content: "hi" }] });
      assert.equal(r.ok, true);
      assert.equal(r.text, "hello");
    },
  );
});

test("callAI surfaces a server-reported error without exposing raw internals", async () => {
  await withFetch(
    (async () => new Response(JSON.stringify({ ok: false, error: "Rate limited." }), { status: 429 })) as any,
    async () => {
      const r = await callAI({ systemPrompt: "sp", messages: [] });
      assert.equal(r.ok, false);
      assert.equal(r.error, "Rate limited.");
    },
  );
});

test("callAI handles a network failure without throwing", async () => {
  await withFetch(
    (async () => {
      throw new TypeError("fetch failed");
    }) as any,
    async () => {
      const r = await callAI({ systemPrompt: "sp", messages: [] });
      assert.equal(r.ok, false);
      assert.match(r.error!, /Could not reach the server/);
      assert.equal(r.aborted, undefined);
    },
  );
});

test("callAI handles a non-JSON server response without throwing", async () => {
  await withFetch(
    (async () => new Response("<html>not json</html>", { status: 502 })) as any,
    async () => {
      const r = await callAI({ systemPrompt: "sp", messages: [] });
      assert.equal(r.ok, false);
      assert.match(r.error!, /unexpected response/);
    },
  );
});

test("callAI marks a genuinely cancelled (AbortError) request as aborted, not a generic failure", async () => {
  await withFetch(
    (async () => {
      const err: any = new Error("The operation was aborted.");
      err.name = "AbortError";
      throw err;
    }) as any,
    async () => {
      const controller = new AbortController();
      controller.abort();
      const r = await callAI({ systemPrompt: "sp", messages: [], signal: controller.signal });
      assert.equal(r.ok, false);
      assert.equal(r.aborted, true);
    },
  );
});

test("callAI passes the abort signal through to fetch so a real superseded request can actually be cancelled", async () => {
  let capturedSignal: AbortSignal | undefined;
  await withFetch(
    (async (_url: any, init: any) => {
      capturedSignal = init.signal;
      return new Response(JSON.stringify({ ok: true, text: "x" }), { status: 200 });
    }) as any,
    async () => {
      const controller = new AbortController();
      await callAI({ systemPrompt: "sp", messages: [], signal: controller.signal });
      assert.equal(capturedSignal, controller.signal);
    },
  );
});
