import test from "node:test";
import assert from "node:assert/strict";
import { FLAG_TRANSFERABLE, encodeCapabilityHex, decodeCapability } from "../../capability-codec/src/index.mjs";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "../../capability-codec/src/service-ids.mjs";
import {
  authorizeRequest,
  createServicePolicy,
  findCurrentOwner,
  verifyServicePolicy,
  verifyServiceRight,
} from "../src/index.mjs";

const ISSUER = `0x${"11".repeat(32)}`;
const FAKE_ISSUER = `0x${"12".repeat(32)}`;
const ROTATED_ISSUER = `0x${"13".repeat(32)}`;
const ALICE = `0x${"aa".repeat(32)}`;
const BOB = `0x${"bb".repeat(32)}`;
const CAPABILITY_ID = `0x${"44".repeat(32)}`;
const SERVICE = PAPER_ANALYZER_V1_SERVICE_ID;
const OTHER_SERVICE = `0x${"55".repeat(32)}`;

function cap({ issuerId = ISSUER, serviceId = SERVICE, flags = FLAG_TRANSFERABLE, expiry = 1_000n } = {}) {
  return decodeCapability(encodeCapabilityHex({ version: 1, flags, serviceId, issuerId, capabilityId: CAPABILITY_ID, expiry }));
}

const policy = createServicePolicy({ serviceId: SERVICE, trustedIssuerId: ISSUER, requireTransferable: true, policyId: "paper-analyzer-v1" });

test("trusted provider-issued transferable service right passes policy", () => {
  assert.equal(verifyServicePolicy({ capability: cap(), policy, nowUnixSeconds: 100n }).capability.issuerId, ISSUER);
});

test("self-issued/fake-provider capability is rejected even for the correct service", () => {
  assert.throws(() => verifyServicePolicy({ capability: cap({ issuerId: FAKE_ISSUER }), policy, nowUnixSeconds: 100n }), (e) => e.code === "UNTRUSTED_ISSUER");
});

test("wrong service and non-transferable rights are rejected by portable-right policy", () => {
  assert.throws(() => verifyServicePolicy({ capability: cap({ serviceId: OTHER_SERVICE }), policy, nowUnixSeconds: 100n }), (e) => e.code === "WRONG_SERVICE");
  assert.throws(() => verifyServicePolicy({ capability: cap({ flags: 0 }), policy, nowUnixSeconds: 100n }), (e) => e.code === "NOT_PORTABLE");
});

test("expiry boundary is denied", () => {
  assert.throws(() => verifyServicePolicy({ capability: cap({ expiry: 100n }), policy, nowUnixSeconds: 100n }), (e) => e.code === "EXPIRED");
});

test("findCurrentOwner returns the live Cell lock hash", () => {
  assert.equal(findCurrentOwner({ lockHash: ALICE }), ALICE);
});

test("Alice owns before transfer; Bob owns after transfer", () => {
  assert.equal(verifyServiceRight({ cell: { lockHash: ALICE }, capability: cap(), requesterLockHash: ALICE, policy, nowUnixSeconds: 100n }).currentOwnerLockHash, ALICE);
  assert.throws(() => verifyServiceRight({ cell: { lockHash: BOB }, capability: cap(), requesterLockHash: ALICE, policy, nowUnixSeconds: 100n }), (e) => e.code === "NOT_OWNER");
  assert.equal(verifyServiceRight({ cell: { lockHash: BOB }, capability: cap(), requesterLockHash: BOB, policy, nowUnixSeconds: 100n }).currentOwnerLockHash, BOB);
});

test("payment cannot restore entitlement after Alice transfers to Bob", () => {
  assert.throws(() => authorizeRequest({
    cell: { lockHash: BOB }, capability: cap(), requesterLockHash: ALICE, policy, nowUnixSeconds: 100n,
    paymentRequired: true, paymentVerified: true,
  }), (e) => e.code === "NOT_OWNER");
});

test("Bob must satisfy payment separately after ownership succeeds", () => {
  assert.throws(() => authorizeRequest({
    cell: { lockHash: BOB }, capability: cap(), requesterLockHash: BOB, policy, nowUnixSeconds: 100n,
    paymentRequired: true, paymentVerified: false,
  }), (e) => e.code === "PAYMENT_REQUIRED");
  assert.equal(authorizeRequest({
    cell: { lockHash: BOB }, capability: cap(), requesterLockHash: BOB, policy, nowUnixSeconds: 100n,
    paymentRequired: true, paymentVerified: true,
  }).authorized, true);
});


test("provider issuer rotation accepts any explicitly trusted issuer and rejects outsiders", () => {
  const rotatingPolicy = createServicePolicy({
    serviceId: SERVICE,
    trustedIssuerIds: [ISSUER, ROTATED_ISSUER, ISSUER.toUpperCase().replace("0X", "0x")],
    requireTransferable: true,
  });
  assert.equal(rotatingPolicy.trustedIssuerIds.length, 2);
  assert.equal(verifyServicePolicy({ capability: cap({ issuerId: ROTATED_ISSUER }), policy: rotatingPolicy, nowUnixSeconds: 100n }).capability.issuerId, ROTATED_ISSUER);
  assert.throws(() => verifyServicePolicy({ capability: cap({ issuerId: FAKE_ISSUER }), policy: rotatingPolicy, nowUnixSeconds: 100n }), (e) => e.code === "UNTRUSTED_ISSUER");
});

test("one shared entitlement can satisfy multiple independent service policies", () => {
  const bundleEntitlement = `0x${"66".repeat(32)}`;
  const serviceA = createServicePolicy({
    serviceId: SERVICE,
    entitlementIds: [bundleEntitlement],
    issuanceEntitlementId: bundleEntitlement,
    bundleId: "research-agent-pack-v1",
    trustedIssuerId: ISSUER,
    requireTransferable: true,
  });
  const serviceB = createServicePolicy({
    serviceId: OTHER_SERVICE,
    entitlementIds: [bundleEntitlement],
    issuanceEntitlementId: bundleEntitlement,
    bundleId: "research-agent-pack-v1",
    trustedIssuerId: ISSUER,
    requireTransferable: true,
  });
  const shared = cap({ serviceId: bundleEntitlement });
  assert.equal(verifyServicePolicy({ capability: shared, policy: serviceA, nowUnixSeconds: 100n }).policy.bundleId, "research-agent-pack-v1");
  assert.equal(verifyServicePolicy({ capability: shared, policy: serviceB, nowUnixSeconds: 100n }).policy.serviceId, OTHER_SERVICE);
});

test("license mode supports non-transferable provider-revocable entitlements", async () => {
  const { FLAG_REVOCABLE } = await import("../../capability-codec/src/index.mjs");
  const licensePolicy = createServicePolicy({
    serviceId: SERVICE,
    trustedIssuerId: ISSUER,
    requireTransferable: false,
    delegationAllowed: false,
    rightMode: "license",
  });
  assert.equal(verifyServicePolicy({ capability: cap({ flags: FLAG_REVOCABLE }), policy: licensePolicy, nowUnixSeconds: 100n }).policy.rightMode, "license");
  assert.throws(() => verifyServicePolicy({ capability: cap({ flags: 0 }), policy: licensePolicy, nowUnixSeconds: 100n }), (e) => e.code === "NOT_REVOCABLE");
});

test("delegation requires both provider opt-in and DELEGATABLE capability flag", async () => {
  const { FLAG_DELEGATABLE } = await import("../../capability-codec/src/index.mjs");
  const { verifyDelegationPolicy } = await import("../src/index.mjs");
  const allowed = createServicePolicy({ serviceId: SERVICE, trustedIssuerId: ISSUER, delegationAllowed: true });
  const disabled = createServicePolicy({ serviceId: SERVICE, trustedIssuerId: ISSUER, delegationAllowed: false });
  assert.doesNotThrow(() => verifyDelegationPolicy({ capability: cap({ flags: FLAG_TRANSFERABLE | FLAG_DELEGATABLE }), policy: allowed }));
  assert.throws(() => verifyDelegationPolicy({ capability: cap(), policy: allowed }), (e) => e.code === "NOT_DELEGATABLE");
  assert.throws(() => verifyDelegationPolicy({ capability: cap({ flags: FLAG_TRANSFERABLE | FLAG_DELEGATABLE }), policy: disabled }), (e) => e.code === "DELEGATION_DISABLED");
});
