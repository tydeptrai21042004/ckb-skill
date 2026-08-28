import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

function run(command, args) {
  const r = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const check = spawnSync("docker", ["--version"], { stdio: "ignore", shell: process.platform === "win32" });
if (check.status !== 0) {
  console.error("Docker is not installed. Install Docker or use `npm run verify:contract` with local Rust.");
  process.exit(1);
}

mkdirSync("contracts/capability-type/build", { recursive: true });
run("docker", ["build", "-f", "Dockerfile.contract", "-t", "skillpass-contract-test", "."]);
run("docker", [
  "run", "--rm",
  "-v", `${resolve("contracts/capability-type/build")}:/work/contracts/capability-type/build`,
  "skillpass-contract-test",
]);
console.log("CKB contract Docker verification passed. Binary copied to contracts/capability-type/build/release/.");
