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
