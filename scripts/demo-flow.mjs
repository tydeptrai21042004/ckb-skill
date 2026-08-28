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

const alice = new TestWallet({ identity: "alice", lockHash: ALICE, secret: "alice-demo" });
const bob = new TestWallet({ identity: "bob", lockHash: BOB, secret: "bob-demo" });
const proofVerifier = new TestProofVerifier([alice, bob]);
const chain = new InMemoryChain();
const initial = chain.issue({
  ownerLockHash: ALICE,
  issuerInputLockHash: ISSUER,
  data: encodeCapabilityHex({ version: 1, flags: FLAG_TRANSFERABLE, serviceId: SERVICE, issuerId: ISSUER, capabilityId: `0x${"44".repeat(32)}`, expiry: 10_000n }),
});
const verifier = new CapabilityVerifier({ chain, expectedServiceId: SERVICE, clock: () => 100n });
const service = new SkillPassService({ challengeStore: new ChallengeStore(), proofVerifier, capabilityVerifier: verifier, lockHashResolver: (id) => proofVerifier.lockHashFor(id) });

function use(wallet, outPoint) {
  const c = service.challenge(wallet.identity);
  return service.analyze({ identity: wallet.identity, nonce: c.nonce, proof: wallet.sign(c.message), outPoint, text: "Method. We test SkillPass. Result. Access follows live ownership. Conclusion." });
}

console.log("1. Issued to Alice:", initial.outPoint);
console.log("2. Alice uses service:", use(alice, initial.outPoint));
const successor = chain.transfer({ outPoint: initial.outPoint, signerLockHash: ALICE, recipientLockHash: BOB });
console.log("3. Transfer committed in local model:", successor.outPoint);
try { use(alice, initial.outPoint); } catch (e) { console.log("4. Alice old-cell access rejected:", e.code, e.message); }
try { use(alice, successor.outPoint); } catch (e) { console.log("5. Alice successor access rejected:", e.code, e.message); }
console.log("6. Bob uses service:", use(bob, successor.outPoint));
