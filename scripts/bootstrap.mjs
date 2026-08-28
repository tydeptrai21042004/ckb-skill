import { copyFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function major(version) {
  return Number(version.replace(/^v/, "").split(".")[0]);
}

if (major(process.version) < 22) {
  console.error(`Node.js 22+ is required; found ${process.version}`);
  process.exit(1);
}

async function copyIfMissing(source, destination) {
  if (existsSync(destination)) return false;
  await copyFile(source, destination);
  return true;
}

await mkdir("deployments", { recursive: true });
const created = [];
if (await copyIfMissing(".env.example", ".env")) created.push(".env");
if (await copyIfMissing("deployments/testnet.example.json", "deployments/testnet.json")) created.push("deployments/testnet.json");
if (await copyIfMissing("deployments/devnet.example.json", "deployments/devnet.json")) created.push("deployments/devnet.json");

const npm = spawnSync("npm", ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
console.log("SkillPass bootstrap complete.");
console.log(`Node: ${process.version}`);
console.log(`npm: ${npm.status === 0 ? npm.stdout.trim() : "not found"}`);
console.log(created.length ? `Created: ${created.join(", ")}` : "Config files already existed; nothing overwritten.");
console.log("\nNext commands:");
console.log("  npm run doctor      # environment/readiness report");
console.log("  npm run dev         # interactive local demo");
console.log("  npm run smoke:http  # automated HTTP/UI smoke test");
console.log("  npm run smoke:paid  # combined capability + x402/Fiber paid flow");
console.log("  npm run verify      # dependency-free protocol/payment verification");
console.log("  ./run_all.sh        # install missing tools/deps and verify all layers");
