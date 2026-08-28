import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FIBER_TESTNET,
  FiberFacilitator,
  MockFiberBackend,
  ReplayStore,
  decodeHeaderJson,
  encodeHeaderJson,
  makePaymentPayload,
  makePaymentRequired,
} from "../src/index.mjs";

async function fixture({ persistent = false } = {}) {
  const backend = new MockFiberBackend();
  const created = await backend.createInvoice({ amount: "100000", currency: "Fibt" });
  const requirement = {
    scheme: "exact", network: FIBER_TESTNET, amount: created.amount, asset: "CKB", payTo: "mock-fiber-provider",
    maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: "fiber-invoice", paymentFlow: "authorization", invoice: created.invoice, paymentHash: created.paymentHash },
  };
  let dir = null;
  if (persistent) dir = await mkdtemp(join(tmpdir(), "skillpass-replay-"));
  const replayStore = new ReplayStore({ file: dir ? join(dir, "settled.json") : "" });
  const facilitator = new FiberFacilitator({ backend, replayStore });
  const resource = { url: "https://example.invalid/api/research", description: "research API", mimeType: "application/json" };
  const payload = makePaymentPayload({ resource, requirement, payer: "agent-A" });
  return { backend, created, requirement, resource, payload, facilitator, dir };
}

test("x402 v2 transport roundtrip and payment-required structure", async () => {
  const f = await fixture();
  const required = makePaymentRequired({ resource: f.resource, requirement: f.requirement });
  assert.equal(decodeHeaderJson(encodeHeaderJson(required), "PAYMENT-REQUIRED").x402Version, 2);
  assert.equal(required.accepts[0].extra.assetTransferMethod, "fiber-invoice");
});

test("facilitator rejects unpaid invoice, accepts paid invoice, then prevents replay", async () => {
  const f = await fixture();
  const request = { x402Version: 2, paymentPayload: f.payload, paymentRequirements: f.requirement };
  assert.deepEqual((await f.facilitator.verify(request)).isValid, false);
  await f.backend.markPaid(f.created.paymentHash, "agent-A");
  assert.deepEqual((await f.facilitator.verify(request)).isValid, true);
  const settled = await f.facilitator.settle(request);
  assert.equal(settled.success, true);
  assert.equal(settled.transaction, f.created.paymentHash);
  assert.equal((await f.facilitator.verify(request)).invalidReason, "payment_already_consumed");
});

test("persistent replay store survives facilitator restart", async () => {
  const f = await fixture({ persistent: true });
  try {
    await f.backend.markPaid(f.created.paymentHash);
    const request = { x402Version: 2, paymentPayload: f.payload, paymentRequirements: f.requirement };
    assert.equal((await f.facilitator.settle(request)).success, true);
    const restarted = new FiberFacilitator({ backend: f.backend, replayStore: new ReplayStore({ file: join(f.dir, "settled.json") }) });
    assert.equal((await restarted.verify(request)).invalidReason, "payment_already_consumed");
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("FNN backend emits documented new_invoice JSON fields and reads paid status", async () => {
  const calls = [];
  const client = {
    async newInvoice(params) {
      calls.push(["new_invoice", params]);
      return {
        invoice_address: "fibt1" + "q".repeat(80),
        invoice: { data: { payment_hash: "0x" + "ab".repeat(32) } },
      };
    },
    async getInvoice(paymentHash) {
      calls.push(["get_invoice", paymentHash]);
      return { status: "Paid" };
    },
  };
  const { FnnFiberBackend } = await import("../src/index.mjs");
  const backend = new FnnFiberBackend({ client });
  const created = await backend.createInvoice({ amount: "100000000", currency: "Fibt", description: "test", expiry: 3600 });
  assert.equal(created.amount, "100000000");
  assert.equal(created.paymentHash, "0x" + "ab".repeat(32));
  assert.equal(calls[0][1].amount, "0x5f5e100");
  assert.equal(calls[0][1].hash_algorithm, "sha256");
  assert.match(calls[0][1].payment_preimage, /^0x[0-9a-f]{64}$/);
  assert.equal(await backend.isPaid(created.paymentHash), true);
});

test("x402 requirement validation rejects amount/invoice/hash mismatch", async () => {
  const f = await fixture();
  const { validatePayload } = await import("../src/index.mjs");
  const wrongAmount = structuredClone(f.payload);
  wrongAmount.accepted.amount = "100001";
  assert.throws(() => validatePayload(wrongAmount, f.requirement), /amount does not match/);
  const wrongHash = structuredClone(f.payload);
  wrongHash.payload.paymentHash = "0x" + "00".repeat(32);
  assert.throws(() => validatePayload(wrongHash, f.requirement), /payment hash mismatch/);
});
