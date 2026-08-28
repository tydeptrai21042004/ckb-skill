import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const name = process.argv[2] || "skillpass-v0.3.0";
const out = `${name}.zip`;
rmSync(out, { force: true });
const exclude = ["node_modules", ".git", ".env", ".runtime", ".tooling", "target", "build", "dist", "coverage", "*.log", "*.zip"];
const args = ["-r", out, ".", ...exclude.flatMap((x) => ["-x", `*${x}*`])];
const r = spawnSync("zip", args, { stdio: "inherit" });
if (r.status !== 0) {
  console.error("zip command is required for npm run release on this platform");
  process.exit(r.status ?? 1);
}
console.log(`Created ${out}`);
