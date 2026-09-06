import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const name = process.argv[2] || "skillpass-v1.0.0-production";
const out = `${name}.zip`;
rmSync(out, { force: true });

// Keep checked-in configuration *templates* in release archives. The previous
// broad `*.env*`-style exclusion accidentally removed .env.*.example files and
// made a clean ZIP impossible to deploy. Only private/local config is excluded.
const excludePatterns = [
  ".git/*", "*/.git/*",
  ".vercel/*", "*/.vercel/*",
  ".env", "./.env",
  ".env.testnet", "./.env.testnet",
  ".env.live", "./.env.live",
  ".env.production", "./.env.production",
  ".secrets/*", "*/.secrets/*",
  ".runtime/*", "*/.runtime/*",
  "deployments/testnet.json", "deployments/devnet.json",
  ".tooling/*", "*/.tooling/*",
  "backups/*", "*/backups/*",
  "*/node_modules/*", "node_modules/*",
  "*/target/*", "target/*",
  "*/build/*", "build/*",
  "*/dist/*", "dist/*",
  "*/coverage/*", "coverage/*",
  "*.log", "*.tsbuildinfo", "*/.DS_Store", "*/Thumbs.db",
  "*.zip",
];
const args = ["-r", out, ".", ...excludePatterns.flatMap((pattern) => ["-x", pattern])];
const result = spawnSync("zip", args, { stdio: "inherit" });
if (result.status !== 0) {
  console.error("zip command is required for npm run release on this platform");
  process.exit(result.status ?? 1);
}
console.log(`Created ${out}`);
