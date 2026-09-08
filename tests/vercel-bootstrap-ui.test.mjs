import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");

test("Vercel API entrypoint fails closed with bounded JSON instead of platform plaintext", () => {
  const src = read("apps/live-service/server.ts");
  assert.match(src, /runtimeEntrypoint = "\.\/server\.mjs"/);
  assert.match(src, /await import\(runtimeEntrypoint\)/);
  assert.match(src, /as \{ server: http\.Server \}/);
  assert.match(src, /SERVICE_NOT_CONFIGURED/);
  assert.match(src, /application\/json; charset=utf-8/);
  assert.match(src, /cache-control.*no-store/s);
  assert.match(src, /x-request-id/);
  assert.doesNotMatch(src, /message:\s*error\.message/);
});

test("Node services export the HTTP server and do not listen inside Vercel", () => {
  for (const file of ["apps/live-service/server.mjs", "apps/fiber-facilitator/server.mjs"]) {
    const src = read(file);
    assert.match(src, /export \{ server \}/);
    assert.match(src, /if \(!process\.env\.VERCEL\)/);
    assert.match(src, /startServer\(\)/);
  }
});

test("frontend parses API responses defensively and never exposes raw non-JSON bootstrap pages", () => {
  const src = read("apps/web/src/App.tsx");
  assert.match(src, /async function parseApiBody/);
  assert.match(src, /const raw = await res\.text\(\)/);
  assert.match(src, /Service API is temporarily unavailable/);
  assert.doesNotMatch(src, /Configuration error:/);
  assert.match(src, /The service is temporarily unavailable\. Please try again later\./);
});

test("production UI keeps protocol/debug information out of the primary workflow", () => {
  const src = read("apps/web/src/App.tsx");
  assert.doesNotMatch(src, /className="connect-steps"/);
  assert.doesNotMatch(src, /className="sidebar-section system-box"/);
  assert.doesNotMatch(src, /x402 v\{/);
  assert.match(src, /<summary>Technical details<\/summary>/);
  assert.match(src, /Portable service rights/);
  assert.match(src, /Manage this pass/);
});
