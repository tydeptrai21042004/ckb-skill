import test from "node:test";
import assert from "node:assert/strict";
import {
  FLAG_TRANSFERABLE,
  encodeCapabilityHex,
  encodeTypeArgs,
} from "../../capability-codec/src/index.mjs";
import { validateGroupShape, validateIssue, validateTransition } from "../src/index.mjs";

const ISSUER = `0x${"11".repeat(32)}`;
const CAP_ID = `0x${"22".repeat(32)}`;
const SERVICE = `0x${"33".repeat(32)}`;
const OWNER_A = `0x${"aa".repeat(32)}`;
const OWNER_B = `0x${"bb".repeat(32)}`;
const ARGS = encodeTypeArgs({ issuerId: ISSUER, capabilityId: CAP_ID });

function data(overrides = {}) {
  return encodeCapabilityHex({
    version: 1,
    flags: FLAG_TRANSFERABLE,
    serviceId: SERVICE,
    issuerId: ISSUER,
    capabilityId: CAP_ID,
    expiry: 2_000_000_000n,
    ...overrides,
  });
}

test("valid issue requires issuer-authorized input", () => {
  const cap = validateIssue({ outputData: data(), typeArgs: ARGS, transactionInputLockHashes: [ISSUER] });
  assert.equal(cap.capabilityId, CAP_ID);
});

test("issue fails without issuer input", () => {
  assert.throws(
    () => validateIssue({ outputData: data(), typeArgs: ARGS, transactionInputLockHashes: [OWNER_A] }),
    /requires an input locked by the issuer/,
  );
});

test("issue fails when issuer or capability identity disagrees with args", () => {
  assert.throws(
    () => validateIssue({ outputData: data({ issuerId: OWNER_A }), typeArgs: ARGS, transactionInputLockHashes: [ISSUER] }),
    /issuer_id must match/,
  );
  assert.throws(
    () => validateIssue({ outputData: data({ capabilityId: OWNER_B }), typeArgs: ARGS, transactionInputLockHashes: [ISSUER] }),
    /capability_id must match/,
  );
});

test("valid transferable ownership change succeeds", () => {
  const result = validateTransition({
    inputData: data(), outputData: data(), inputLockHash: OWNER_A, outputLockHash: OWNER_B, typeArgs: ARGS,
  });
  assert.equal(result.capabilityId, CAP_ID);
});

test("non-transferable ownership change fails", () => {
  const locked = data({ flags: 0 });
  assert.throws(
    () => validateTransition({ inputData: locked, outputData: locked, inputLockHash: OWNER_A, outputLockHash: OWNER_B, typeArgs: ARGS }),
    /cannot change owner lock/,
  );
});

test("non-transferable same-owner refresh is allowed", () => {
  const locked = data({ flags: 0 });
  assert.doesNotThrow(() => validateTransition({ inputData: locked, outputData: locked, inputLockHash: OWNER_A, outputLockHash: OWNER_A, typeArgs: ARGS }));
});

test("every immutable field mutation fails", () => {
  const mutations = [
    { flags: 0 },
    { serviceId: OWNER_B },
    { issuerId: OWNER_B },
    { capabilityId: OWNER_B },
    { expiry: 2_000_000_001n },
  ];
  for (const patch of mutations) {
    assert.throws(
      () => validateTransition({ inputData: data(), outputData: data(patch), inputLockHash: OWNER_A, outputLockHash: OWNER_B, typeArgs: ARGS }),
      /immutable/,
    );
  }
});

test("group shape accepts only issue and one-to-one transition", () => {
  assert.equal(validateGroupShape({ inputCount: 0, outputCount: 1 }), "ISSUE");
  assert.equal(validateGroupShape({ inputCount: 1, outputCount: 1 }), "TRANSITION");
  assert.throws(() => validateGroupShape({ inputCount: 1, outputCount: 0 }), /destruction is not enabled/);
  assert.throws(() => validateGroupShape({ inputCount: 0, outputCount: 2 }), /expected 0->1 or 1->1/);
});
