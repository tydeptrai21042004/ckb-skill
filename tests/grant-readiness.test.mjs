import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("grant-ready release contains reproducible configuration and CI assets", () => {
  for (const file of [
    ".env.example", ".env.testnet.example", ".env.live.example", ".env.production.example", ".env.vercel.example",
    ".gitignore", ".dockerignore", ".github/workflows/security-readiness.yml",
    "docs/PROVIDER_INTEGRATION.md", "docs/GRANT_READINESS_PLAN.md",
  ]) assert.equal(existsSync(file), true, `missing ${file}`);
});

test("execution path uses an owned lease rather than ambiguous state observation", () => {
  const state = read("apps/live-service/state.mjs");
  const server = read("apps/live-service/server.mjs");
  assert.match(state, /acquireExecutionLease/);
  assert.match(state, /executionLeaseToken/);
  assert.match(state, /compareAndSetFields/);
  assert.match(state, /completeExecutionLease/);
  assert.match(server, /acquireExecutionForRequest/);
  assert.match(server, /executionLease\.acquired/);
  assert.doesNotMatch(server, /expectedStates: \["PAYMENT_VERIFIED"\], state: "EXECUTION_RESERVED"/);
});

test("multi-provider pilot pins three distinct signed manifest identities", () => {
  const compose = read("deploy/compose.multi-provider-pilot.yaml");
  const check = read("scripts/pilot-check.mjs");
  for (const provider of ["provider-model-a", "provider-data-b", "provider-compute-c"]) {
    assert.match(compose, new RegExp(provider));
  }
  assert.match(compose, /SKILLPASS_REQUIRE_SIGNED_MANIFEST: "true"/);
  assert.match(check, /verifyTrustedProviderManifest/);
  assert.match(check, /pinned manifest fingerprint/);
});
