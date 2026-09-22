import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("clean release includes required hidden configuration and CI assets", () => {
  for (const path of [
    ".env.example", ".env.testnet.example", ".env.live.example", ".env.production.example", ".env.vercel.example",
    ".gitignore", ".dockerignore", ".github/workflows/security-readiness.yml",
  ]) assert.equal(existsSync(path), true, `missing ${path}`);
  const workflow = read(".github/workflows/security-readiness.yml");
  assert.match(workflow, /node-version:\s*['"]24\.20\.0['"]/);
  assert.match(workflow, /node --test/);
  assert.match(workflow, /make -C contracts\/capability-type test/);
});

test("Capability V2 contract suite covers issuance transfer immutability and malformed binding combinations", () => {
  const contract = read("contracts/capability-type/tests/contract.rs");
  for (const name of [
    "valid_v2_issue_succeeds",
    "valid_v2_transfer_succeeds_and_preserves_all_binding_fields",
    "v2_subject_type_is_immutable",
    "v2_binding_mode_is_immutable",
    "v2_subject_id_is_immutable",
    "v2_policy_hash_is_immutable",
    "v2_non_holder_binding_requires_subject",
    "v2_subject_type_and_subject_id_must_be_consistent",
    "v2_rejects_binding_mode_outside_supported_range",
    "valid_v2_supported_binding_modes_issue",
    "v2_wrong_length_is_rejected",
  ]) assert.match(contract, new RegExp(`fn ${name}\\b`), `missing Rust test ${name}`);
});

test("live-service authorization delegates to the public canonical provider verifier", () => {
  const source = read("apps/live-service/server.mjs");
  assert.match(source, /verifySkillPassAuthorization/);
  assert.match(source, /verifyResolvedCapabilityCell/);
  const start = source.indexOf("async function verifyLiveCapability");
  const end = source.indexOf("async function verifyDelegatedCapability", start);
  const body = source.slice(start, end);
  assert.match(body, /await verifySkillPassAuthorization\(/);
  assert.doesNotMatch(body, /cellOutput\.lock\.eq\(requester\.script\)/);
});

test("public verifier packages use declared package boundaries without monorepo fallback imports", () => {
  const verifier = read("packages/provider-verifier/src/index.mjs");
  const rights = read("packages/service-rights/src/index.mjs");
  assert.match(verifier, /from "@skillpass\/capability-codec"/);
  assert.match(verifier, /from "@skillpass\/service-rights"/);
  assert.doesNotMatch(verifier, /\.\.\/\.\.\/capability-codec\/src/);
  assert.doesNotMatch(verifier, /\.\.\/\.\.\/service-rights\/src/);
  assert.match(rights, /from "@skillpass\/capability-codec"/);
  assert.doesNotMatch(rights, /\.\.\/\.\.\/capability-codec\/src/);
});

test("Testnet evidence is verified over CKB RPC rather than by JSON shape alone", () => {
  const evidence = read("scripts/testnet-evidence.mjs");
  const rpc = read("scripts/ckb-rpc.mjs");
  for (const token of ["getHistoricalCell", "liveCellStatus", "transactionConsumesOutPoint", "dataCodeHash"]) assert.match(evidence, new RegExp(token));
  assert.match(evidence, /Capability data is byte-identical before and after transfer/);
  assert.match(evidence, /Alice pre-transfer outpoint is no longer live/);
  assert.match(evidence, /Bob successor Capability outpoint is live/);
  assert.match(rpc, /get_live_cell/);
  assert.match(rpc, /get_transaction/);
  assert.match(rpc, /get_tip_header/);
});

test("independent provider lifecycle has separate RPC ownership and no entitlement database", () => {
  const runner = read("scripts/independent-provider-lifecycle.mjs");
  const initializer = read("scripts/init-independent-providers.mjs");
  assert.match(runner, /verifySkillPassAuthorization/);
  assert.match(runner, /ownerSourceOfTruth/);
  assert.match(runner, /entitlementDatabase/);
  assert.match(runner, /before-alice-allow/);
  assert.match(runner, /after-bob-allow/);
  assert.match(initializer, /PROVIDER_A_CKB_RPC_URL/);
  assert.match(initializer, /PROVIDER_B_CKB_RPC_URL/);
  assert.match(initializer, /entitlementDatabase: null/);
});
