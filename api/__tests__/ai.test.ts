/**
 * Guards the Vercel entry point's wiring — not its request-handling logic
 * (that's already fully covered by netlify/functions/__tests__/ai.test.ts,
 * since both entry points re-export the exact same function from
 * ../_lib/handler.ts). What's specific to this file is: does it actually
 * export that same handler (not a stale copy), and does it declare the
 * Edge runtime Vercel needs to run a Web-standard Request/Response handler
 * unmodified.
 */
import test from "node:test";
import assert from "node:assert/strict";
import vercelHandler, { config } from "../ai.ts";
import netlifyHandler from "../../netlify/functions/ai.ts";
import sharedHandler from "../_lib/handler.ts";

test("api/ai.ts exports the exact same handler function as the Netlify entry point and the shared implementation (no duplicate/stale copy)", () => {
  assert.equal(vercelHandler, sharedHandler);
  assert.equal(netlifyHandler, sharedHandler);
});

test("api/ai.ts declares the Edge runtime, so the shared handler's Web-standard Request/Response usage runs unmodified", () => {
  assert.equal(config.runtime, "edge");
});
