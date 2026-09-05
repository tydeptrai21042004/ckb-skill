import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function command(name, args = ["--version"]) {
  const r = spawnSync(name, args, { encoding: "utf8", shell: process.platform === "win32" });
  return { ok: r.status === 0, detail: r.status === 0 ? (r.stdout || r.stderr).trim().split("\n")[0] : "not installed" };
}

function deploymentReady(file) {
  if (!existsSync(file)) return { ok: false, detail: "missing; run npm run setup" };
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    const hash = String(value.codeHash || "");
    const tx = String(value.depTxHash || "");
    const ok = /^0x[0-9a-fA-F]{64}$/.test(hash) && /^0x[0-9a-fA-F]{64}$/.test(tx);
    return { ok, detail: ok ? `${value.network || "unknown"} metadata looks populated` : "template/placeholder values still present" };
  } catch (e) {
    return { ok: false, detail: `invalid JSON: ${e.message}` };
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
const rows = [
  ["Node 22+", { ok: nodeMajor >= 22, detail: process.version }],
  ["npm", command("npm")],
  ["Rust/Cargo (contract)", command("cargo")],
  ["Docker (optional)", command("docker")],
  ["OffCKB (optional)", command("offckb")],
  ["Fiber FNN (optional)", command("fnn")],
  [".env", { ok: existsSync(".env"), detail: existsSync(".env") ? "present" : "missing; npm run setup creates it" }],
  ["testnet deployment", deploymentReady("deployments/testnet.json")],
];

console.log("SkillPass environment doctor\n");
for (const [name, result] of rows) {
  console.log(`${result.ok ? "[OK]  " : "[WARN]"} ${name.padEnd(24)} ${result.detail}`);
}
console.log("\nReadiness levels:");
console.log("- Local demo/tests need only Node 22+.");
console.log("- Contract verification additionally needs Rust + riscv64imac-unknown-none-elf.");
console.log("- Testnet use additionally needs real deployment metadata and a CCC-compatible wallet.");
console.log("- Fiber FNN is optional for deterministic tests; a real paid E2E needs configured/funded Fiber topology.");
console.log("- OffCKB/Docker are optional helpers for deployment/reproducibility; no Git/GitHub checkout is required.");
