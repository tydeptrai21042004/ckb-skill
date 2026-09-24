import test from "node:test";
import assert from "node:assert/strict";
import { encodeCapabilityHex, encodeTypeArgs } from "../packages/capability-codec/src/index.mjs";
import { createServicePolicy } from "../packages/service-rights/src/index.mjs";
import { verifyResolvedCapabilityCell, verifySkillPassAuthorization } from "../packages/provider-verifier/src/index.mjs";

const hex32 = (byte) => `0x${byte.repeat(64)}`;
const SERVICE_ID = hex32("1");
const ISSUER_ID = hex32("2");
const CAPABILITY_ID = hex32("3");
const ALICE = hex32("a");
const BOB = hex32("b");
const CODE_HASH = hex32("5");
const BLOCK_HASH = hex32("6");
const TX_HASH = hex32("7");

function capability(overrides = {}) {
  return {
    version: 1,
    flags: 1,
    serviceId: SERVICE_ID,
    issuerId: ISSUER_ID,
    capabilityId: CAPABILITY_ID,
    expiry: 2_000_000_000n,
    ...overrides,
  };
}

const deployment = Object.freeze({ codeHash: CODE_HASH, hashType: "data2" });
const policy = createServicePolicy({ serviceId: SERVICE_ID, trustedIssuerId: ISSUER_ID, requireTransferable: true });

function liveCell({ cap = capability(), owner = ALICE, confirmations = 3, status = "live", type = null, outputData = null, extra = {} } = {}) {
  return {
    status,
    outputData: outputData ?? encodeCapabilityHex(cap),
    lockHash: owner,
    confirmations,
    outPoint: { txHash: TX_HASH, index: 0 },
    blockNumber: "12345",
    blockHash: BLOCK_HASH,
    cellOutput: { type: type ?? { ...deployment, args: encodeTypeArgs(cap) } },
    ...extra,
  };
}

async function decision({ cap = capability(), requester = ALICE, cell = liveCell({ cap }), usedPolicy = policy, usedDeployment = deployment, minConfirmations = 1, now = 1_900_000_000n } = {}) {
  return verifySkillPassAuthorization({
    capability: cap,
    policy: usedPolicy,
    requesterLockHash: requester,
    deployment: usedDeployment,
    minConfirmations,
    resolveLiveCell: async () => cell,
    nowUnixSeconds: now,
  });
}

function codeIs(code) {
  return (error) => error?.code === code;
}

const rejectCases = [
  ["stale Alice is rejected after transfer", () => decision({ requester: ALICE, cell: liveCell({ owner: BOB }) }), "NOT_OWNER"],
  ["wrong deployment code hash is rejected", () => decision({ usedDeployment: { ...deployment, codeHash: hex32("8") } }), "WRONG_DEPLOYMENT"],
  ["wrong deployment hash type is rejected", () => decision({ usedDeployment: { ...deployment, hashType: "type" } }), "WRONG_DEPLOYMENT"],
  ["spent cell status is rejected", () => decision({ cell: liveCell({ status: "dead" }) }), "CELL_NOT_LIVE"],
  ["unknown cell status is rejected", () => decision({ cell: liveCell({ status: "unknown" }) }), "CELL_NOT_LIVE"],
  ["missing live cell is rejected", () => verifySkillPassAuthorization({ capability: capability(), policy, requesterLockHash: ALICE, deployment, minConfirmations: 1, resolveLiveCell: async () => null, nowUnixSeconds: 1_900_000_000n }), "CELL_NOT_LIVE"],
  ["zero confirmations are rejected", () => decision({ cell: liveCell({ confirmations: 0 }) }), "CAPABILITY_NOT_FINAL"],
  ["missing confirmation metadata is rejected", () => { const cell = liveCell(); delete cell.confirmations; return decision({ cell }); }, "FINALITY_METADATA_UNAVAILABLE"],
  ["malformed confirmation metadata is rejected", () => decision({ cell: liveCell({ confirmations: -1 }) }), "FINALITY_METADATA_INVALID"],
  ["wrong capability data is rejected", () => { const requested = capability(); const stored = capability({ capabilityId: hex32("9") }); return decision({ cap: requested, cell: liveCell({ cap: stored }) }); }, "CAPABILITY_DATA_MISMATCH"],
  ["type args/data identity mismatch is rejected", () => { const cap = capability(); return decision({ cap, cell: liveCell({ cap, type: { ...deployment, args: `0x${"00".repeat(64)}` } }) }); }, "IDENTITY_MISMATCH"],
  ["malformed output data is rejected", () => decision({ cell: liveCell({ outputData: "0x01" }) }), "MALFORMED_CAPABILITY"],
  ["malformed owner lock hash is rejected", () => decision({ cell: liveCell({ owner: "0x1234" }) }), "MALFORMED_OWNER"],
  ["untrusted issuer is rejected", () => decision({ usedPolicy: createServicePolicy({ serviceId: SERVICE_ID, trustedIssuerId: hex32("c"), requireTransferable: true }) }), "UNTRUSTED_ISSUER"],
  ["wrong service is rejected", () => decision({ usedPolicy: createServicePolicy({ serviceId: hex32("d"), trustedIssuerId: ISSUER_ID, requireTransferable: true }) }), "WRONG_SERVICE"],
  ["expired capability is rejected", () => decision({ cap: capability({ expiry: 1_800_000_000n }), cell: liveCell({ cap: capability({ expiry: 1_800_000_000n }) }) }), "EXPIRED"],
  ["non-transferable capability is rejected by transferable policy", () => { const cap = capability({ flags: 0 }); return decision({ cap, cell: liveCell({ cap }) }); }, "NOT_PORTABLE"],
  ["resolver failure fails closed", () => verifySkillPassAuthorization({ capability: capability(), policy, requesterLockHash: ALICE, deployment, minConfirmations: 1, resolveLiveCell: async () => { throw Object.assign(new Error("rpc unavailable"), { code: "RPC_UNAVAILABLE" }); }, nowUnixSeconds: 1_900_000_000n }), "RPC_UNAVAILABLE"],
];

for (const [name, run, code] of rejectCases) {
  test(name, async () => {
    await assert.rejects(run, codeIs(code));
  });
}

test("Alice is authorized before transfer", async () => {
  const result = await decision();
  assert.equal(result.authorized, true);
  assert.equal(result.currentOwnerLockHash, ALICE);
});

test("Bob is authorized after transfer", async () => {
  const result = await decision({ requester: BOB, cell: liveCell({ owner: BOB }) });
  assert.equal(result.authorized, true);
  assert.equal(result.currentOwnerLockHash, BOB);
});

test("authorization decision preserves chain evidence metadata", async () => {
  const result = await decision();
  assert.deepEqual(result.chain.outPoint, { txHash: TX_HASH, index: 0 });
  assert.equal(result.chain.blockNumber, "12345");
  assert.equal(result.chain.blockHash, BLOCK_HASH);
  assert.equal(result.chain.confirmations, 3);
  assert.equal(result.chain.requiredConfirmations, 1);
});

test("zero-confirmation policy is allowed only when explicitly configured", async () => {
  const result = await decision({ cell: liveCell({ confirmations: 0 }), minConfirmations: 0 });
  assert.equal(result.authorized, true);
  assert.equal(result.chain.confirmations, 0);
});
