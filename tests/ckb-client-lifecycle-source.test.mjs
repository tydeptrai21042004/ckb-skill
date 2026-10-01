import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("packages/ckb-client/src/live.ts", "utf8");

test("generic v2 issuance refuses unproven ATOMIC binding", () => {
  assert.match(source, /bindingMode === BINDING_ATOMIC[\s\S]{0,500}reserved for a subject-specific adapter/);
});

test("surrender builder is owner-only and does not require active or transferable rights", () => {
  const start = source.indexOf("export async function buildSurrenderCapabilityTx");
  const end = source.indexOf("export async function sendAndWait", start);
  assert.ok(start >= 0 && end > start, "surrender builder must be exported");
  const body = source.slice(start, end);
  assert.match(body, /connected signer is not the current capability owner/);
  assert.match(body, /surrender must not create a successor SkillPass capability Cell/);
  assert.doesNotMatch(body, /isActive\(/);
  assert.doesNotMatch(body, /FLAG_TRANSFERABLE/);
});
