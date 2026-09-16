import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const name = process.argv[2] || "skillpass-v1.8.0-funding-candidate";
const out = `${name}.zip`;
rmSync(out, { force: true });

const requiredReleaseFiles = [
  ".env.example",
  ".env.testnet" + ".example",
  ".env.live.example",
  ".env.production.example",
  ".env.vercel.example",
  ".gitignore",
  ".dockerignore",
  ".github/workflows/security-readiness.yml",
  "LICENSE",
  "package.json",
  "dependency-versions.lock.json",
  "contracts/capability-type/Cargo.toml",
  "docs/PROVIDER_INTEGRATION.md",
  "scripts/evidence-verify.mjs",
  "scripts/provider-scaffold.mjs",
  "RELEASE_NOTES_V1_8.md",
  "docs/AUTHORIZATION_EVIDENCE.md",
];
const missing = requiredReleaseFiles.filter((file) => !existsSync(file));
if (missing.length) {
  console.error(`Refusing to build an incomplete release. Missing: ${missing.join(", ")}`);
  process.exit(1);
}

// Keep checked-in configuration templates in release archives. Only private/local
// configuration, secrets, generated state and build products are excluded.
const excludePatterns = [
  ".git/*", "*/.git/*",
  ".vercel/*", "*/.vercel/*",
  ".env", "./.env",
  ".env.testnet", "./.env.testnet",
  ".env.live", "./.env.live",
  ".env.production", "./.env.production",
  ".env.vercel.gui", "./.env.vercel.gui",
  ".env.vercel.generated", "./.env.vercel.generated",
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

const listing = spawnSync("unzip", ["-Z1", out], { encoding: "utf8" });
if (listing.status === 0) {
  const members = new Set(String(listing.stdout || "").split(/\r?\n/).filter(Boolean).map((x) => x.replace(/^\.\//, "")));
  const omitted = requiredReleaseFiles.filter((file) => !members.has(file));
  if (omitted.length) {
    rmSync(out, { force: true });
    console.error(`Release verification failed; archive omitted: ${omitted.join(", ")}`);
    process.exit(1);
  }
}
console.log(`Created and checked ${out}`);
