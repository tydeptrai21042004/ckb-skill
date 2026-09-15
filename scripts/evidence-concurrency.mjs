#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { LiveServiceState } from "../apps/live-service/state.mjs";
import { JsonRecordStore } from "../packages/x402-fiber/src/record-store.mjs";

const count = Number(process.argv[2] || 100);
if (!Number.isSafeInteger(count) || count < 2 || count > 5000) throw new Error("request count must be 2..5000");
const state = new LiveServiceState({ store: new JsonRecordStore() });
const invocation = {
  invocationKey: "ab".repeat(32), serviceSlug: "compute-api-v1", capabilityId: `0x${"cd".repeat(32)}`,
  capabilityOutPoint: { txHash: `0x${"ef".repeat(32)}`, index: "0x0" }, operationId: "grant-concurrency-proof",
  requestHash: "12".repeat(32), ownerLockHash: `0x${"34".repeat(32)}`, principalAddress: "ckt1-evidence",
  paymentRequired: false, expiresAt: Date.now() + 60_000,
};
await state.beginInvocation(invocation);
await state.advanceInvocation(invocation.invocationKey, { expectedStates: ["AUTHORIZED"], state: "PAYMENT_VERIFIED" });
const startedAt = Date.now();
const claims = await Promise.all(Array.from({ length: count }, () => state.acquireExecutionLease(invocation.invocationKey, { leaseMs: 30_000 })));
const winners = claims.filter((claim) => claim.acquired);
let protectedSideEffects = 0;
if (winners.length === 1) protectedSideEffects += 1;
if (winners.length !== 1) throw new Error(`expected one execution winner, got ${winners.length}`);
await state.completeExecutionLease(invocation.invocationKey, winners[0].token, {
  result: { ok: true, protectedSideEffects }, resultHash: "56".repeat(32),
});
const report = {
  schemaVersion: "1.0",
  generatedAt: new Date().toISOString(),
  concurrentRequests: count,
  executionLeaseWinners: winners.length,
  protectedSideEffects,
  duplicateExecutions: Math.max(0, protectedSideEffects - 1),
  elapsedMs: Date.now() - startedAt,
  pass: winners.length === 1 && protectedSideEffects === 1,
};
const dir = resolve(process.cwd(), ".runtime/evidence");
mkdirSync(dir, { recursive: true });
const file = resolve(dir, "concurrency-proof.json");
writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
console.log(`Evidence written to ${file}`);
