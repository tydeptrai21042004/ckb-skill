import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const required = [
  ".env.example",
  ".env.testnet.example",
  ".env.live.example",
  "deploy.sh",
  "deploy.ps1",
  "deploy.cmd",
  "HUONG_DAN_TRIEN_KHAI.md",
  "TRIEN_KHAI_NHANH_VI.md",
  "HUONG_DAN_SU_DUNG.md",
  "KIEN_TRUC_VA_BAO_MAT_VI.md",
  "XU_LY_LOI_VI.md",
  "THAY_DOI_V0.6.md",
  "docs/CONG_DONG_CKB_FIBER_VI.md",
];

test("release/deployment handoff contains cross-platform config and Vietnamese docs", () => {
  for (const path of required) assert.equal(existsSync(path), true, `missing required handoff file: ${path}`);
});

test("release packager preserves env templates while excluding private runtime files", () => {
  const release = readFileSync("scripts/release.mjs", "utf8");
  assert.match(release, /"\.env\.testnet"/);
  assert.match(release, /"backups\/\*"/);
  assert.match(release, /"deployments\/testnet\.json"/);
  assert.match(release, /"\*\.tsbuildinfo"/);
  assert.doesNotMatch(release, /["\']\.env\.\*["\']/);
  assert.doesNotMatch(release, /["\']\.env\.testnet\.example["\']/);
});

test("support bundle implementation never serializes sensitive env values", () => {
  const support = readFileSync("scripts/support-bundle.mjs", "utf8");
  assert.match(support, /facilitatorAuthConfigured/);
  assert.match(support, /fiberRpcTokenConfigured/);
  assert.doesNotMatch(support, /FACILITATOR_AUTH_TOKEN:\s*env\.FACILITATOR_AUTH_TOKEN/);
  assert.doesNotMatch(support, /FIBER_RPC_TOKEN:\s*env\.FIBER_RPC_TOKEN/);
});
