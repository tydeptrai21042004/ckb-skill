import test from "node:test";
import assert from "node:assert/strict";
import { assessProviderDecision } from "../scripts/lifecycle-assertions.mjs";

test("correct owner and transferred owner are authorized at their respective phases", () => {
  for (const id of ["before-alice-allow", "after-bob-allow"]) {
    assert.equal(assessProviderDecision({id, expected: true, authorized: true, code: "ALLOW"}).passed, true);
  }
});

test("negative decisions require their specific chain/ownership reason", () => {
  assert.equal(assessProviderDecision({id: "before-bob-deny", expected: false, authorized: false, code: "NOT_OWNER"}).passed, true);
  assert.equal(assessProviderDecision({id: "after-alice-deny", expected: false, authorized: false, code: "CELL_NOT_LIVE"}).passed, true);
  for (const code of ["CKB_RPC_TIMEOUT", "WRONG_DEPLOYMENT", "NOT_OWNER", "DENY", "UNKNOWN_ERROR"]) {
    assert.equal(assessProviderDecision({id: "after-alice-deny", expected: false, authorized: false, code}).passed, code === "CELL_NOT_LIVE");
  }
  assert.equal(assessProviderDecision({id: "before-bob-deny", expected: false, authorized: false, code: "CELL_NOT_LIVE"}).passed, false);
  assert.equal(assessProviderDecision({id: "after-bob-allow", expected: true, authorized: false, code: "CELL_NOT_LIVE"}).passed, false);
});

test("unrecognized acceptance cases cannot silently pass", () => {
  assert.throws(() => assessProviderDecision({id: "custom", expected: false, authorized: false, code: "NOT_OWNER"}), /Unknown/);
});
