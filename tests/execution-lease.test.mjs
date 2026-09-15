import test from "node:test";
import assert from "node:assert/strict";
import { LiveServiceState } from "../apps/live-service/state.mjs";
import { JsonRecordStore } from "../packages/x402-fiber/src/record-store.mjs";

function invocation(overrides = {}) {
  return {
    invocationKey: "11".repeat(32),
    serviceSlug: "compute-api-v1",
    capabilityId: `0x${"22".repeat(32)}`,
    capabilityOutPoint: { txHash: `0x${"33".repeat(32)}`, index: "0x0" },
    operationId: "job-42",
    requestHash: "44".repeat(32),
    ownerLockHash: `0x${"55".repeat(32)}`,
    principalAddress: "ckt1-test",
    paymentRequired: false,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

test("100 concurrent retries produce exactly one execution-lease winner", async () => {
  const state = new LiveServiceState({ store: new JsonRecordStore() });
  const input = invocation();
  await state.beginInvocation(input);
  await state.advanceInvocation(input.invocationKey, { expectedStates: ["AUTHORIZED"], state: "PAYMENT_VERIFIED" });

  const claims = await Promise.all(Array.from({ length: 100 }, () => state.acquireExecutionLease(input.invocationKey, { leaseMs: 30_000 })));
  const winners = claims.filter((item) => item.acquired);
  assert.equal(winners.length, 1);
  assert.equal(claims.filter((item) => item.record.state === "EXECUTION_RESERVED").length, 100);

  let sideEffects = 0;
  if (winners[0].acquired) sideEffects += 1;
  const completed = await state.completeExecutionLease(input.invocationKey, winners[0].token, {
    result: { ok: true, sideEffects },
    resultHash: "66".repeat(32),
  });
  assert.equal(sideEffects, 1);
  assert.equal(completed.state, "EXECUTED");
  assert.equal(completed.result.sideEffects, 1);
});

test("only one worker can reclaim an expired execution lease", async () => {
  let now = 1_000_000;
  const state = new LiveServiceState({ store: new JsonRecordStore({ now: () => now }), now: () => now });
  const input = invocation({ expiresAt: now + 60_000 });
  await state.beginInvocation(input);
  await state.advanceInvocation(input.invocationKey, { expectedStates: ["AUTHORIZED"], state: "PAYMENT_VERIFIED" });
  const first = await state.acquireExecutionLease(input.invocationKey, { leaseMs: 5_000, executorToken: "aa".repeat(24) });
  assert.equal(first.acquired, true);

  now += 5_001;
  const claims = await Promise.all(Array.from({ length: 50 }, (_, i) => state.acquireExecutionLease(input.invocationKey, {
    leaseMs: 5_000,
    executorToken: (i + 1).toString(16).padStart(2, "0").repeat(24),
  })));
  assert.equal(claims.filter((item) => item.acquired).length, 1);
  assert.equal(claims.find((item) => item.acquired).record.executionLeaseGeneration, 2);
});

test("non-owner lease token cannot persist an execution result", async () => {
  const state = new LiveServiceState({ store: new JsonRecordStore() });
  const input = invocation();
  await state.beginInvocation(input);
  await state.advanceInvocation(input.invocationKey, { expectedStates: ["AUTHORIZED"], state: "PAYMENT_VERIFIED" });
  const lease = await state.acquireExecutionLease(input.invocationKey, { leaseMs: 30_000, executorToken: "aa".repeat(24) });
  assert.equal(lease.acquired, true);
  await assert.rejects(
    () => state.completeExecutionLease(input.invocationKey, "bb".repeat(24), { result: { ok: true }, resultHash: "66".repeat(32) }),
    (error) => error?.code === "EXECUTION_LEASE_LOST",
  );
});
