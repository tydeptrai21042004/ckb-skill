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

test("reserved delegation budget is released after failed delivery and can be used again", async () => {
  const ledger = new LocalDelegationUsageLedger({ now: () => 1_700_000_000_000 });
  const input = { ...base, maxUses: 1, invocationKey: "66".repeat(32) };
  const reserved = await ledger.reserve(input);
  assert.equal(reserved.status, "reserved");
  assert.equal(reserved.usedCalls, 0);
  assert.equal(reserved.reservedCalls, 1);
  assert.equal(reserved.remainingUses, 0);

  const released = await ledger.release(input);
  assert.equal(released.status, "released");
  assert.equal(released.usedCalls, 0);
  assert.equal(released.reservedCalls, 0);
  assert.equal(released.remainingUses, 1);

  const retry = { ...base, maxUses: 1, invocationKey: "77".repeat(32) };
  await ledger.reserve(retry);
  const committed = await ledger.commit(retry);
  assert.equal(committed.status, "committed");
  assert.equal(committed.usedCalls, 1);
  assert.equal(committed.reservedCalls, 0);
});

test("an in-flight reservation prevents concurrent oversubscription", async () => {
  const ledger = new LocalDelegationUsageLedger({ now: () => 1_700_000_000_000 });
  const first = { ...base, maxUses: 1, invocationKey: "88".repeat(32), spendAtomic: "0" };
  const second = { ...base, maxUses: 1, invocationKey: "99".repeat(32), spendAtomic: "0" };
  await ledger.reserve(first);
  await assert.rejects(
    () => ledger.reserve(second),
    (error) => error.code === "DELEGATION_USE_LIMIT_EXHAUSTED" && error.status === 403,
  );
});

test("committed invocation is idempotent and cannot be released", async () => {
  const ledger = new LocalDelegationUsageLedger({ now: () => 1_700_000_000_000 });
  const input = { ...base, invocationKey: "aa".repeat(32), spendAtomic: "50" };
  await ledger.reserve(input);
  const committed = await ledger.commit(input);
  assert.equal(committed.usedCalls, 1);
  const replay = await ledger.reserve(input);
  assert.equal(replay.status, "committed");
  assert.equal(replay.replayed, true);
  const released = await ledger.release(input);
  assert.equal(released.status, "committed");
  assert.equal(released.usedCalls, 1);
});
