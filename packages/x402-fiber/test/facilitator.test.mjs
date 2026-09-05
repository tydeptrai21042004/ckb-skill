import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function fixture({ persistent = false, proofMode = "invoice-status" } = {}) {
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
  const facilitator = new FiberFacilitator({ backend, replayStore, proofMode });
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

test("settle is idempotent after payment consumption while verify remains replay-strict", async () => {
  const f = await fixture();
  const request = { x402Version: 2, paymentPayload: f.payload, paymentRequirements: f.requirement };
  await f.backend.markPaid(f.created.paymentHash, "agent-A");
  const first = await f.facilitator.settle(request);
  const second = await f.facilitator.settle(request);
  assert.equal(first.success, true);
  assert.equal(first.extensions["io.nervos.skillpass"].idempotent, false);
  assert.equal(second.success, true);
  assert.equal(second.transaction, first.transaction);
  assert.equal(second.extensions["io.nervos.skillpass"].idempotent, true);
  assert.equal((await f.facilitator.verify(request)).invalidReason, "payment_already_consumed");
});

test("idempotent settlement cannot be reused with a different requirement or payer", async () => {
  const f = await fixture();
  const request = { x402Version: 2, paymentPayload: f.payload, paymentRequirements: f.requirement };
  await f.backend.markPaid(f.created.paymentHash, "agent-A");
  assert.equal((await f.facilitator.settle(request)).success, true);

  const changedRequirement = structuredClone(f.requirement);
  changedRequirement.amount = "100001";
  const changedPayload = makePaymentPayload({ resource: f.resource, requirement: changedRequirement, payer: "agent-A" });
  const changed = await f.facilitator.settle({ x402Version: 2, paymentPayload: changedPayload, paymentRequirements: changedRequirement });
  assert.equal(changed.success, false);
  assert.equal(changed.errorReason, "payment_already_consumed");

  const changedPayerPayload = makePaymentPayload({ resource: f.resource, requirement: f.requirement, payer: "agent-B" });
  const changedPayer = await f.facilitator.settle({ x402Version: 2, paymentPayload: changedPayerPayload, paymentRequirements: f.requirement });
  assert.equal(changedPayer.success, false);
  assert.equal(changedPayer.errorReason, "payment_already_consumed");
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


test("preimage proof mode requires and validates the paid invoice preimage", async () => {
  const f = await fixture({ proofMode: "preimage" });
  const paid = await f.backend.markPaid(f.created.paymentHash, "agent-A");
  const withoutProof = { x402Version: 2, paymentPayload: f.payload, paymentRequirements: f.requirement };
  assert.equal((await f.facilitator.verify(withoutProof)).invalidReason, "payment_preimage_required");

  const wrong = makePaymentPayload({
    resource: f.resource,
    requirement: f.requirement,
    payer: "agent-A",
    paymentPreimage: "0x" + "11".repeat(32),
  });
  assert.equal((await f.facilitator.verify({ ...withoutProof, paymentPayload: wrong })).invalidReason, "payment_preimage_mismatch");

  const correct = makePaymentPayload({
    resource: f.resource,
    requirement: f.requirement,
    payer: "agent-A",
    paymentPreimage: paid.paymentPreimage,
  });
  assert.equal((await f.facilitator.verify({ ...withoutProof, paymentPayload: correct })).isValid, true);
});

test("concurrent first access waits for persisted replay state to load", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skillpass-replay-load-"));
  const file = join(dir, "settled.json");
  const hash = "0x" + "77".repeat(32);
  try {
    await writeFile(file, JSON.stringify([{ key: hash.toLowerCase(), consumedAt: Date.now() }]), "utf8");
    const store = new ReplayStore({ file });
    const [exists, consumed] = await Promise.all([store.has(hash), store.consume(hash)]);
    assert.equal(exists, true);
    assert.equal(consumed, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
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

test("facilitator HTTP client sends bearer auth and parses JSON", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true, path: new URL(url).pathname }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const { FacilitatorHttpClient } = await import("../src/index.mjs");
  const client = new FacilitatorHttpClient({ baseUrl: "https://fac.example/", token: "secret", fetchImpl });
  const result = await client.invoice({ amount: "10" });
  assert.equal(result.path, "/invoice");
  assert.equal(calls[0].init.headers.authorization, "Bearer secret");
  assert.equal(JSON.parse(calls[0].init.body).amount, "10");
});

test("backend health probes distinguish mock and FNN", async () => {
  const mock = new MockFiberBackend();
  assert.equal((await mock.health()).backend, "mock");
  const { FnnFiberBackend } = await import("../src/index.mjs");
  const fnn = new FnnFiberBackend({ client: { nodeInfo: async () => ({ version: "0.9.0" }) } });
  assert.equal((await fnn.health()).node.version, "0.9.0");
});
