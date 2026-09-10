import test from "node:test";
import assert from "node:assert/strict";
import { assertDelegationScope, buildDelegationMessage, normalizeDelegationGrant } from "../src/index.mjs";

const H1 = `0x${"11".repeat(32)}`;
const H2 = `0x${"22".repeat(32)}`;
const now = 1_700_000_000_000;
const grant = {
  version: 1,
  grantId: "aa".repeat(16),
  ownerAddress: "ckt1owner-address",
  delegateAddress: "ckt1delegate-address",
  serviceSlug: "model-api-v1",
  serviceId: H1,
  capabilityId: H2,
  capabilityOutPoint: { txHash: H1, index: "0" },
  action: "invoke",
  issuedAt: now,
  expiresAt: now + 60_000,
};

test("delegation v1 message stays deterministic and backward compatible", () => {
  const a = buildDelegationMessage(grant);
  const b = buildDelegationMessage({ ...grant, capabilityOutPoint: { index: 0, txHash: H1 } });
  assert.equal(a, b);
  assert.match(a, /version=1/);
  assert.match(a, /delegate=ckt1delegate-address/);
  assert.doesNotMatch(a, /max_uses/);
});

test("delegation v2 signs use and spend limits", () => {
  const v2 = { ...grant, version: 2, limits: { maxUses: 20, maxSpendAtomic: "500000" } };
  const message = buildDelegationMessage(v2);
  assert.match(message, /version=2/);
  assert.match(message, /max_uses=20/);
  assert.match(message, /max_spend_atomic=500000/);
  const normalized = normalizeDelegationGrant(v2, { now });
  assert.deepEqual(normalized.limits, { maxUses: 20, maxSpendAtomic: "500000" });
});

test("delegation v2 rejects empty or unsafe limits", () => {
  assert.throws(() => normalizeDelegationGrant({ ...grant, version: 2, limits: {} }, { now }), /at least one usage limit/i);
  assert.throws(() => normalizeDelegationGrant({ ...grant, version: 2, limits: { maxUses: 0 } }, { now }), /maxUses/i);
  assert.throws(() => normalizeDelegationGrant({ ...grant, version: 2, limits: { maxSpendAtomic: "-1" } }, { now }), /maxSpendAtomic/i);
});

test("delegation rejects expired and mismatched delegate", () => {
  assert.throws(() => assertDelegationScope(grant, { now: now + 60_000, delegateAddress: grant.delegateAddress }), /expired/i);
  assert.throws(() => assertDelegationScope(grant, { now: now + 1, delegateAddress: "ckt1someone-else" }), /different delegate/i);
});

test("delegation lifetime is bounded", () => {
  assert.throws(() => normalizeDelegationGrant({ ...grant, expiresAt: now + 25 * 60 * 60 * 1000 }, { now }), /lifetime/i);
});
