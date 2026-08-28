import test from "node:test";
import assert from "node:assert/strict";
import { FLAG_TRANSFERABLE, encodeCapabilityHex } from "../packages/capability-codec/src/index.mjs";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "../packages/capability-codec/src/service-ids.mjs";
import { ChallengeStore } from "../packages/verifier/src/challenge-store.mjs";
import { InMemoryChain } from "../packages/verifier/src/in-memory-chain.mjs";
import { TestProofVerifier, TestWallet } from "../packages/verifier/src/mock-wallet.mjs";
import { CapabilityVerifier } from "../packages/verifier/src/verifier.mjs";
import { SkillPassService } from "../apps/demo-service/src/service.mjs";

const ISSUER = `0x${"11".repeat(32)}`;
const ALICE = `0x${"aa".repeat(32)}`;
const BOB = `0x${"bb".repeat(32)}`;
const SERVICE = PAPER_ANALYZER_V1_SERVICE_ID;

function call(service, wallet, outPoint, text = "A short research paper. Method. Result. Conclusion.") {
  const c = service.challenge(wallet.identity);
  return service.analyze({ identity: wallet.identity, nonce: c.nonce, proof: wallet.sign(c.message), outPoint, text });
}

test("MVP: A uses -> transfers -> A denied -> B uses", () => {
  const alice = new TestWallet({ identity: "alice", lockHash: ALICE, secret: "alice" });
  const bob = new TestWallet({ identity: "bob", lockHash: BOB, secret: "bob" });
  const proofVerifier = new TestProofVerifier([alice, bob]);
  const chain = new InMemoryChain();
  const initial = chain.issue({
    ownerLockHash: ALICE,
    issuerInputLockHash: ISSUER,
    data: encodeCapabilityHex({
      version: 1,
      flags: FLAG_TRANSFERABLE,
      serviceId: SERVICE,
      issuerId: ISSUER,
      capabilityId: `0x${"44".repeat(32)}`,
      expiry: 10_000n,
    }),
  });
  const capabilityVerifier = new CapabilityVerifier({ chain, expectedServiceId: SERVICE, clock: () => 100n });
  const service = new SkillPassService({
    challengeStore: new ChallengeStore({ ttlMs: 60_000 }),
    proofVerifier,
    capabilityVerifier,
    lockHashResolver: (identity) => proofVerifier.lockHashFor(identity),
  });

  // 1) A owns and can use.
  assert.equal(call(service, alice, initial.outPoint).service, "paper-analyzer-v1");

  // 2) A transfers the live cell to B.
  const successor = chain.transfer({ outPoint: initial.outPoint, signerLockHash: ALICE, recipientLockHash: BOB });
  assert.equal(chain.getLiveCell(initial.outPoint), undefined);
  assert.equal(chain.getLiveCell(successor.outPoint).lockHash, BOB);

  // 3) A cannot use the consumed old cell.
  assert.throws(() => call(service, alice, initial.outPoint), /missing or already consumed/);

  // 4) A also cannot impersonate ownership of B's successor cell.
  assert.throws(() => call(service, alice, successor.outPoint), /does not control/);

  // 5) B can use the exact same capability after transfer.
  assert.equal(call(service, bob, successor.outPoint).service, "paper-analyzer-v1");
});
