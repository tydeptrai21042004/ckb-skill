import test from "node:test";
import assert from "node:assert/strict";
import { FLAG_TRANSFERABLE, encodeCapabilityHex } from "../../../packages/capability-codec/src/index.mjs";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "../../../packages/capability-codec/src/service-ids.mjs";
import { ChallengeStore } from "../../../packages/verifier/src/challenge-store.mjs";
import { InMemoryChain } from "../../../packages/verifier/src/in-memory-chain.mjs";
import { TestProofVerifier, TestWallet } from "../../../packages/verifier/src/mock-wallet.mjs";
import { CapabilityVerifier } from "../../../packages/verifier/src/verifier.mjs";
import { SkillPassService } from "../src/service.mjs";

const ISSUER = `0x${"11".repeat(32)}`;
const A = `0x${"aa".repeat(32)}`;
const SERVICE = PAPER_ANALYZER_V1_SERVICE_ID;

function fixture() {
  const alice = new TestWallet({ identity: "alice", lockHash: A, secret: "s1" });
  const proofVerifier = new TestProofVerifier([alice]);
  const chain = new InMemoryChain();
  const cell = chain.issue({
    ownerLockHash: A,
    issuerInputLockHash: ISSUER,
    data: encodeCapabilityHex({
      version: 1,
      flags: FLAG_TRANSFERABLE,
      serviceId: SERVICE,
      issuerId: ISSUER,
      capabilityId: `0x${"44".repeat(32)}`,
      expiry: 200n,
    }),
  });
  const challengeStore = new ChallengeStore({ ttlMs: 1000, now: () => 1000 });
  const capabilityVerifier = new CapabilityVerifier({ chain, expectedServiceId: SERVICE, clock: () => 100n });
  const service = new SkillPassService({
    challengeStore,
    proofVerifier,
    capabilityVerifier,
    lockHashResolver: (identity) => proofVerifier.lockHashFor(identity),
  });
  return { alice, chain, cell, service };
}

test("owner with valid one-time proof receives structured analysis", () => {
  const { alice, cell, service } = fixture();
  const c = service.challenge("alice");
  const result = service.analyze({
    identity: "alice",
    nonce: c.nonce,
    proof: alice.sign(c.message),
    outPoint: cell.outPoint,
    text: "Method. We analyze a small paper. However, this is only a test. Conclusion.",
  });
  assert.equal(result.service, "paper-analyzer-v1");
  assert.ok(result.words > 5);
});

test("bad proof fails and nonce cannot be replayed", () => {
  const { alice, cell, service } = fixture();
  const c = service.challenge("alice");
  assert.throws(() => service.analyze({ identity: "alice", nonce: c.nonce, proof: "00", outPoint: cell.outPoint, text: "x" }), /did not verify/);
  assert.throws(() => service.analyze({ identity: "alice", nonce: c.nonce, proof: alice.sign(c.message), outPoint: cell.outPoint, text: "x" }), /already used/);
});

test("paper analyzer rejects empty and oversized input after valid auth", () => {
  {
    const { alice, cell, service } = fixture();
    const c = service.challenge("alice");
    assert.throws(
      () => service.analyze({
        identity: "alice",
        nonce: c.nonce,
        proof: alice.sign(c.message),
        outPoint: cell.outPoint,
        text: "",
      }),
      /must not be empty/,
    );
  }

  {
    const { alice, cell, service } = fixture();
    const c = service.challenge("alice");
    assert.throws(
      () => service.analyze({
        identity: "alice",
        nonce: c.nonce,
        proof: alice.sign(c.message),
        outPoint: cell.outPoint,
        text: "x".repeat(20_001),
      }),
      /exceeds 20000 characters/,
    );
  }
});
