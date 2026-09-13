import test from "node:test";
import assert from "node:assert/strict";
import { formatAuthorizationIntent } from "../src/index.mjs";

const H = `0x${"11".repeat(32)}`;

test("canonical authorization intent binds capability, request, policy and operation", () => {
  const message = formatAuthorizationIntent({
    serviceSlug: "compute-api-v1", serviceId: H, policyId: "bundle:compute", policyFingerprint: "22".repeat(32),
    capabilityOutPoint: { txHash: H, index: "1" }, requestHash: "33".repeat(32), operationId: "job-0001",
    delegationId: "44".repeat(16), address: "ckt1-test", nonce: "55".repeat(24), expiresAt: 2_000_000_000_000,
  });
  assert.match(message, /^SkillPass Authorization Intent v1/m);
  for (const token of ["capability_outpoint=", "request_hash=", "policy_fingerprint=", "operation_id=job-0001", "delegation_id="]) assert.match(message, new RegExp(token));
});
