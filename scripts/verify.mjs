import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const required = [
  "README.md",
  "HOW_TO_VERIFY.md",
  "Dockerfile",
  "compose.yaml",
  "contracts/capability-type/src/main.rs",
  "contracts/capability-type/tests/contract.rs",
  "packages/capability-codec/src/index.mjs",
  "packages/ckb-client/src/live.ts",
  "packages/ckb-client/src/challenge.ts",
  "apps/demo-service/server.mjs",
  "apps/fiber-facilitator/server.mjs",
  "packages/x402-fiber/src/facilitator.mjs",
  "packages/x402-fiber/test/facilitator.test.mjs",
  "run_all.sh",
  "apps/demo-service/public/index.html",
  "apps/demo-service/public/app.js",
  "apps/web/src/App.tsx",
  "apps/live-service/server.mjs",
  "Dockerfile.live",
  "compose.live.yaml",
  "tests/e2e.test.mjs",
  "reports/verification-matrix.md",
];

for (const file of required) {
  if (!existsSync(file)) {
    console.error(`MISSING: ${file}`);
    process.exit(1);
  }
}

const codecSource = readFileSync("packages/capability-codec/src/index.mjs", "utf8");
if (/\bBuffer\b/.test(codecSource) || /node:/.test(codecSource)) {
  console.error("Browser-safe codec regression: shared codec must not depend on Node Buffer/node:* modules");
  process.exit(1);
}

function run(command, args) {
  const res = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (res.error) throw res.error;
  if (res.status !== 0) process.exit(res.status ?? 1);
}

console.log("[1/5] Required project files + browser-safe codec: OK");
console.log("[2/5] Service/facilitator JavaScript syntax");
run(process.execPath, ["--check", "apps/live-service/server.mjs"]);
run(process.execPath, ["--check", "apps/fiber-facilitator/server.mjs"]);
console.log("[3/5] Node acceptance tests");
run(process.execPath, ["--test"]);
console.log("[4/5] Two-user local demonstration");
run(process.execPath, ["scripts/demo-flow.mjs"]);
console.log("[5/5] HTTP + interactive UI smoke test");
run(process.execPath, ["scripts/smoke-http.mjs"]);
console.log("LOCAL CORE VERIFIED: codec, state machine, service, two-user flow, HTTP API, and browser UI smoke checks are green.");
console.log("The root npm run verify command additionally runs Fiber/x402 and paid-access smokes plus the benchmark.");
console.log("NOTE: CKB RISC-V contract and real CKB/Fiber network verification are separate checks in HOW_TO_VERIFY.md.");
