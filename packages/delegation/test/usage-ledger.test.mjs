import test from "node:test";
import assert from "node:assert/strict";
import { LocalDelegationUsageLedger } from "../src/usage-ledger.mjs";

const base = {
  grantId: "aa".repeat(16),
  maxUses: 2,
  maxSpendAtomic: "300",
  spendAtomic: "100",
  expiresAt: 1_700_000_100_000,
};

test("delegation usage ledger enforces use and spend caps atomically per invocation key", async () => {
  const ledger = new LocalDelegationUsageLedger({ now: () => 1_700_000_000_000 });
  const first = await ledger.consume({ ...base, invocationKey: "11".repeat(32) });
  assert.equal(first.usedCalls, 1);
  assert.equal(first.usedSpendAtomic, "100");
  assert.equal(first.remainingUses, 1);
  assert.equal(first.remainingSpendAtomic, "200");

  const replay = await ledger.consume({ ...base, invocationKey: "11".repeat(32) });
  assert.equal(replay.replayed, true);
  assert.equal(replay.usedCalls, 1);

  const second = await ledger.consume({ ...base, invocationKey: "22".repeat(32), spendAtomic: "200" });
  assert.equal(second.usedCalls, 2);
  assert.equal(second.usedSpendAtomic, "300");
  await assert.rejects(() => ledger.consume({ ...base, invocationKey: "33".repeat(32), spendAtomic: "0" }), /use limit exhausted/i);
});

test("delegation spend cap rejects an otherwise valid call", async () => {
  const ledger = new LocalDelegationUsageLedger({ now: () => 1_700_000_000_000 });
  await assert.rejects(() => ledger.consume({ ...base, maxUses: 10, maxSpendAtomic: "50", invocationKey: "44".repeat(32) }), /spend limit exhausted/i);
});

test("delegation usage expires with the grant", async () => {
  const ledger = new LocalDelegationUsageLedger({ now: () => base.expiresAt });
  await assert.rejects(() => ledger.consume({ ...base, invocationKey: "55".repeat(32) }), /expired/i);
});
