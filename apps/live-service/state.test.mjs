import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LiveServiceState } from "./state.mjs";

test("live payment quotes survive service-state restart and can be deleted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skillpass-live-state-"));
  const file = join(dir, "state.json");
  try {
    const state = new LiveServiceState({ file });
    await state.setQuote("0xABC", { binding: "request-1", expiresAt: Date.now() + 60_000 });
    const restarted = new LiveServiceState({ file });
    assert.equal((await restarted.getQuote("0xabc")).binding, "request-1");
    assert.equal(await restarted.deleteQuote("0xAbC"), true);
    assert.equal(await restarted.getQuote("0xabc"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("successful delivery receipt survives restart while expired quotes are pruned", async () => {
  let now = 10_000;
  const dir = await mkdtemp(join(tmpdir(), "skillpass-live-receipt-"));
  const file = join(dir, "state.json");
  try {
    const state = new LiveServiceState({ file, now: () => now });
    await state.setQuote("0x01", { binding: "expired", expiresAt: now + 5 });
    await state.setReceipt("0x02", { binding: "paid-request", result: { score: 1 }, settlement: { success: true } });
    now += 10;
    assert.equal(await state.pruneExpiredQuotes(), 1);

    const restarted = new LiveServiceState({ file, now: () => now });
    assert.equal(await restarted.getQuote("0x01"), null);
    assert.deepEqual((await restarted.getReceipt("0x02")).result, { score: 1 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test("old delivery receipts are pruned after the configured retention window", async () => {
  let now = 1_000;
  const dir = await mkdtemp(join(tmpdir(), "skillpass-live-receipt-ttl-"));
  const file = join(dir, "state.json");
  try {
    const state = new LiveServiceState({ file, now: () => now });
    await state.setReceipt("0x03", { binding: "request", result: { ok: true }, settlement: { success: true } });
    now += 999;
    assert.equal(await state.pruneExpiredReceipts(1_000), 0);
    now += 1;
    assert.equal(await state.pruneExpiredReceipts(1_000), 1);
    assert.equal(await state.getReceipt("0x03"), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
