import test from "node:test";
import assert from "node:assert/strict";
import { FLAG_TRANSFERABLE, encodeCapabilityHex } from "../../capability-codec/src/index.mjs";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "../../capability-codec/src/service-ids.mjs";
import { stableId32 } from "../../capability-codec/src/node-ids.mjs";
import { InMemoryChain } from "../src/in-memory-chain.mjs";
import { CapabilityVerifier } from "../src/verifier.mjs";
import { ChallengeStore } from "../src/challenge-store.mjs";

const ISSUER = `0x${"11".repeat(32)}`;
const OWNER = `0x${"22".repeat(32)}`;
const STRANGER = `0x${"33".repeat(32)}`;
const CAP_ID = `0x${"44".repeat(32)}`;
const SERVICE = PAPER_ANALYZER_V1_SERVICE_ID;

function issue(chain, { serviceId = SERVICE, expiry = 200n } = {}) {
  return chain.issue({
    ownerLockHash: OWNER,
    issuerInputLockHash: ISSUER,
    data: encodeCapabilityHex({
      version: 1,
      flags: FLAG_TRANSFERABLE,
      serviceId,
      issuerId: ISSUER,
      capabilityId: CAP_ID,
      expiry,
    }),
  });
}

test("current owner succeeds", () => {
  const chain = new InMemoryChain();
  const cell = issue(chain);
  const verifier = new CapabilityVerifier({ chain, expectedServiceId: SERVICE, clock: () => 100n });
  assert.equal(verifier.verify({ outPoint: cell.outPoint, requesterLockHash: OWNER }).capability.capabilityId, CAP_ID);
});

test("unrelated wallet fails", () => {
  const chain = new InMemoryChain();
  const cell = issue(chain);
  const verifier = new CapabilityVerifier({ chain, expectedServiceId: SERVICE, clock: () => 100n });
  assert.throws(() => verifier.verify({ outPoint: cell.outPoint, requesterLockHash: STRANGER }), /does not control/);
});

test("expired capability fails at boundary", () => {
  const chain = new InMemoryChain();
  const cell = issue(chain, { expiry: 100n });
  const verifier = new CapabilityVerifier({ chain, expectedServiceId: SERVICE, clock: () => 100n });
  assert.throws(() => verifier.verify({ outPoint: cell.outPoint, requesterLockHash: OWNER }), /expired/);
});

test("wrong-service capability fails", () => {
  const chain = new InMemoryChain();
  const cell = issue(chain, { serviceId: stableId32("other-service") });
  const verifier = new CapabilityVerifier({ chain, expectedServiceId: SERVICE, clock: () => 100n });
  assert.throws(() => verifier.verify({ outPoint: cell.outPoint, requesterLockHash: OWNER }), /different service/);
});

test("consumed old capability fails", () => {
  const chain = new InMemoryChain();
  const cell = issue(chain);
  chain.consumeUnsafeForTest(cell.outPoint);
  const verifier = new CapabilityVerifier({ chain, expectedServiceId: SERVICE, clock: () => 100n });
  assert.throws(() => verifier.verify({ outPoint: cell.outPoint, requesterLockHash: OWNER }), /missing or already consumed/);
});

test("nonce is one-time", () => {
  let now = 1_000;
  const store = new ChallengeStore({ ttlMs: 100, now: () => now });
  const challenge = store.issue("alice");
  assert.equal(store.consume({ nonce: challenge.nonce, identity: "alice" }).message, challenge.message);
  assert.throws(() => store.consume({ nonce: challenge.nonce, identity: "alice" }), /already used/);
});

test("expired nonce fails", () => {
  let now = 1_000;
  const store = new ChallengeStore({ ttlMs: 100, now: () => now });
  const challenge = store.issue("alice");
  now = 1_100;
  assert.throws(() => store.consume({ nonce: challenge.nonce, identity: "alice" }), /expired/);
});

test("same capability identity cannot be issued twice", () => {
  const chain = new InMemoryChain();
  issue(chain);
  assert.throws(() => issue(chain), /identity was already issued/);
});
