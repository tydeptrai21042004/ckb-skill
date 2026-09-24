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

test("two independently configured providers converge on the same CKB ownership lifecycle", async () => {
  const providers = [
    { providerId: "provider-a", acceptedService: "model-api", rpcProfile: "rpc-a", keyId: "key-a" },
    { providerId: "provider-b", acceptedService: "private-data-api", rpcProfile: "rpc-b", keyId: "key-b" },
  ];

  const reports = [];
  for (const provider of providers) {
    const report = await runPortableOwnershipConformance({
      aliceLockHash: ALICE,
      bobLockHash: BOB,
      metadata: provider,
      authorize: ({ phase, requesterLockHash }) => {
        const canonicalOwner = phase === "before-transfer" ? ALICE : BOB;
        if (requesterLockHash.toLowerCase() !== canonicalOwner.toLowerCase()) {
          const error = new Error("not current owner");
          error.code = "NOT_OWNER";
          throw error;
        }
        return { authorized: true, code: "ALLOW" };
      },
    });
    assertPortableOwnershipConformance(report);
    reports.push(report);
  }

  assert.equal(reports.length, 2);
  assert.notEqual(reports[0].metadata.providerId, reports[1].metadata.providerId);
  assert.notEqual(reports[0].metadata.rpcProfile, reports[1].metadata.rpcProfile);
  assert.notEqual(reports[0].metadata.keyId, reports[1].metadata.keyId);
  assert.deepEqual(
    reports.map((report) => report.results.map((item) => [item.id, item.actualAllowed])),
    [
      [["before-alice-allow", true], ["before-bob-deny", false], ["after-alice-deny", false], ["after-bob-allow", true]],
      [["before-alice-allow", true], ["before-bob-deny", false], ["after-alice-deny", false], ["after-bob-allow", true]],
    ],
  );
});
