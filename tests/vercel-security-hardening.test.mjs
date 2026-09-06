import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

test("public paid flow authenticates wallet and live CKB ownership before creating a Fiber invoice", async () => {
  const src = await readFile(join(ROOT, "apps/live-service/server.mjs"), "utf8");
  const analyze = src.indexOf('url.pathname === "/api/analyze"');
  const auth = src.indexOf("authenticateProtectedRequest(requestBody)", analyze);
  const quote = src.indexOf("createPaymentQuote(req, requestBody)", analyze);
  assert.ok(analyze >= 0 && auth > analyze && quote > auth, "invoice must not be created before wallet/CKB auth");
});

test("public status is shallow and deep readiness is opt-in/token guarded", async () => {
  const src = await readFile(join(ROOT, "apps/live-service/server.mjs"), "utf8");
  assert.match(src, /ENABLE_DEEP_HEALTH/);
  assert.match(src, /DEEP_HEALTH_TOKEN/);
  const status = src.slice(src.indexOf('url.pathname === "/api/status"'), src.indexOf('url.pathname === "/readyz"'));
  assert.match(status, /dependencies:/);
  assert.match(status, /checked: "on-protected-request"/);
  assert.doesNotMatch(status, /await readiness\(\)/);
});

test("Vercel Services schema stays valid and database pool is bounded for cost safety", async () => {
  const vercel = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"));
  assert.equal(Object.prototype.hasOwnProperty.call(vercel.services.api, "maxDuration"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(vercel.services.facilitator, "maxDuration"), false);
  const config = await readFile(join(ROOT, "packages/production-store/src/config.mjs"), "utf8");
  assert.match(config, /env\.VERCEL \? 2 : 20/);
  assert.match(config, /statement_timeout:\s*8_000/);
});

test("Vercel setup no longer pulls production secrets to a local env file", async () => {
  const setup = await readFile(join(ROOT, "setup-vercel.sh"), "utf8");
  assert.doesNotMatch(setup, /vercel env pull/);
  assert.match(setup, /vercel env run -e production -- node scripts\/check-vercel-env\.mjs/);
  assert.match(setup, /--sensitive/);
});

test("release security preflight passes", () => {
  const run = spawnSync(process.execPath, [join(ROOT, "scripts/security-preflight.mjs")], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /security preflight: PASS/i);
});
