import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LiveServiceState } from "../apps/live-service/state.mjs";
import { JsonRecordStore } from "../packages/x402-fiber/src/record-store.mjs";

const read = (path) => readFileSync(path, "utf8");

const invocation = {
  invocationKey: "11".repeat(32),
  serviceSlug: "compute-api-v1",
  capabilityId: `0x${"22".repeat(32)}`,
  capabilityOutPoint: { txHash: `0x${"33".repeat(32)}`, index: "0x0" },
  operationId: "job-42",
  requestHash: "44".repeat(32),
  ownerLockHash: `0x${"55".repeat(32)}`,
  principalAddress: "ckt1-test",
  paymentRequired: true,
  expiresAt: Date.now() + 60_000,
};

test("operation id is durably bound to one request hash", async () => {
  const state = new LiveServiceState({ store: new JsonRecordStore() });
  const first = await state.beginInvocation(invocation);
  assert.equal(first.state, "AUTHORIZED");
  const replay = await state.beginInvocation(invocation);
  assert.equal(replay.requestHash, invocation.requestHash);
  await assert.rejects(
    () => state.beginInvocation({ ...invocation, invocationKey: "66".repeat(32), requestHash: "77".repeat(32) }),
    (error) => error?.code === "IDEMPOTENCY_KEY_REUSE",
  );
});

test("invocation state machine is monotonic and keeps executed output", async () => {
  const state = new LiveServiceState({ store: new JsonRecordStore() });
  await state.beginInvocation(invocation);
  await state.advanceInvocation(invocation.invocationKey, { expectedStates: ["AUTHORIZED"], state: "PAYMENT_VERIFIED" });
  await state.advanceInvocation(invocation.invocationKey, { expectedStates: ["PAYMENT_VERIFIED"], state: "EXECUTION_RESERVED" });
  const executed = await state.advanceInvocation(invocation.invocationKey, {
    expectedStates: ["EXECUTION_RESERVED"], state: "EXECUTED",
    patch: { result: { jobId: "upstream-1", state: "succeeded" }, resultHash: "88".repeat(32) },
  });
  assert.equal(executed.result.jobId, "upstream-1");
  const replay = await state.advanceInvocation(invocation.invocationKey, { expectedStates: ["AUTHORIZED"], state: "PAYMENT_VERIFIED" });
  assert.equal(replay.state, "EXECUTED");
  assert.equal(replay.result.jobId, "upstream-1");
});

test("live authorization enforces V2 subject binding and chain finality evidence", () => {
  const server = read("apps/live-service/server.mjs");
  assert.match(server, /resolveSubjectBinding/);
  assert.match(server, /verifySubjectBinding/);
  assert.match(server, /SUBJECT_RESOLVER_UNAVAILABLE/);
  assert.match(server, /SKILLPASS_MIN_CAPABILITY_CONFIRMATIONS/);
  assert.match(server, /finalityEvidence/);
  assert.match(server, /createAuthorizationEvidence/);
});

test("idempotency key binds provider, policy, outpoint, operation and request", () => {
  const server = read("apps/live-service/server.mjs");
  for (const token of ["providerId", "policyFingerprint", "capabilityOutPoint", "operationId", "requestHash"]) {
    assert.match(server, new RegExp(token));
  }
  assert.match(server, /skillpass-invocation-v2/);
});

test("provider verification and signed transport primitives are shipped", () => {
  const verifier = read("packages/provider-verifier/src/index.mjs");
  for (const symbol of ["verifyProviderAuthorization", "signProviderManifest", "verifyProviderManifest", "createGatewayAssertion", "verifyGatewayAssertion"]) {
    assert.match(verifier, new RegExp(`export (?:async )?function ${symbol}`));
  }
  const services = read("apps/live-service/services.mjs");
  assert.match(services, /resolvePinnedAddress/);
  assert.match(services, /x-skillpass-authorization/);
  assert.match(services, /UPSTREAM_ADDRESS_REJECTED/);
});

test("public production forbids mock Fiber", () => {
  assert.match(read("apps/fiber-facilitator/server.mjs"), /IS_PUBLIC_PRODUCTION && PAYMENTS_REQUIRED_FOR_DEPLOYMENT && MODE !== "fnn"/);
});

test("production release generates and mounts independent signing keys", () => {
  const deploy = read("deploy-production.sh");
  const compose = read("deploy/compose.production.yaml");
  assert.match(deploy, /provider_manifest_ed25519\.pem/);
  assert.match(deploy, /gateway_signing_ed25519\.pem/);
  assert.match(compose, /SKILLPASS_PROVIDER_MANIFEST_PRIVATE_KEY_FILE/);
  assert.match(compose, /SKILLPASS_GATEWAY_SIGNING_PRIVATE_KEY_FILE/);
});

test("Fiber 0x payment hashes are normalized into durable invocation/evidence digests", () => {
  const server = read("apps/live-service/server.mjs");
  assert.match(server, /function paymentHashDigest/);
  assert.match(server, /raw\.startsWith\("0x"\) \? raw\.slice\(2\)/);
  assert.match(server, /const paymentDigest = paymentHashDigest\(payment\?\.hash\)/);
  assert.match(server, /paymentProofHash = paymentDigest \? `0x\$\{paymentDigest\}`/);
});
