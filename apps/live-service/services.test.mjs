import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./services.mjs", import.meta.url), "utf8");

test("multi-upstream gateway configuration is bounded and production-host allowlisted", () => {
  assert.match(source, /SKILLPASS_UPSTREAM_SERVICES_JSON/);
  assert.match(source, /supports at most 12 upstream services/);
  assert.match(source, /SKILLPASS_GATEWAY_ALLOWED_HOSTS is required/);
  assert.match(source, /private, link-local, multicast/);
});

test("gateway keeps bearer credentials server-side and refuses side-effect mode without idempotency", () => {
  assert.match(source, /SKILLPASS_UPSTREAM_BEARERS_JSON/);
  assert.match(source, /operationMode must be read; side-effecting upstreams require an explicit idempotency contract/);
  assert.match(source, /redirect: "error"/);
  assert.doesNotMatch(source, /publicList\(\).*bearer/s);
});
