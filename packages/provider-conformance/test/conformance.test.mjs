import test from "node:test";
import assert from "node:assert/strict";
import {
  OWNERSHIP_SCENARIOS,
  runPortableOwnershipConformance,
  assertPortableOwnershipConformance,
} from "../src/index.mjs";

const ALICE = `0x${"aa".repeat(32)}`;
const BOB = `0x${"bb".repeat(32)}`;

test("portable ownership conformance encodes the Alice-to-Bob lifecycle", async () => {
  assert.equal(OWNERSHIP_SCENARIOS.length, 4);
  const report = await runPortableOwnershipConformance({
    aliceLockHash: ALICE,
    bobLockHash: BOB,
    metadata: { providerId: "provider-a" },
    authorize: ({ phase, requesterLockHash }) => {
      const owner = phase === "before-transfer" ? ALICE : BOB;
      if (requesterLockHash.toLowerCase() !== owner.toLowerCase()) {
        const error = new Error("not current owner");
        error.code = "NOT_OWNER";
        throw error;
      }
      return { authorized: true, code: "ALLOW" };
    },
  });
  assert.equal(report.passed, true);
  assert.equal(report.results.find((item) => item.id === "after-alice-deny").code, "NOT_OWNER");
  assert.doesNotThrow(() => assertPortableOwnershipConformance(report));
});

test("conformance fails if a provider keeps authorizing the stale owner", async () => {
  const report = await runPortableOwnershipConformance({
    aliceLockHash: ALICE,
    bobLockHash: BOB,
    authorize: ({ requesterLockHash }) => requesterLockHash.toLowerCase() === ALICE.toLowerCase(),
  });
  assert.equal(report.passed, false);
  assert.equal(report.results.find((item) => item.id === "after-alice-deny").passed, false);
  assert.throws(() => assertPortableOwnershipConformance(report), { code: "SKILLPASS_PROVIDER_CONFORMANCE_FAILED" });
});
