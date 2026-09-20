#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";

const failures = [];
const warnings = [];
const required = [
  ".env.example", ".env.testnet.example", ".env.live.example", ".env.production.example", ".env.vercel.example",
  ".gitignore", ".dockerignore", ".github/workflows/security-readiness.yml",
  "FUNDING.md", "HOW_TO_VERIFY.md", "docs/FUNDING_ACCEPTANCE_MATRIX.md", "docs/REFERENCE_APPLICATIONS.md",
  "reference-apps/skillpass-care.json", "evidence/testnet/README.md"
];
for (const file of required) {
  try { await access(file); } catch { failures.push(`missing ${file}`); }
}

const funding = await readFile("FUNDING.md", "utf8");
for (const phrase of ["existing work", "Alice->Bob", "Independent provider", "non-goals", "SkillPass Care"]) {
  if (!funding.toLowerCase().includes(phrase.toLowerCase())) failures.push(`FUNDING.md must explain ${phrase}`);
}
const readme = await readFile("README.md", "utf8");
if (!/live Cell lock/i.test(readme)) failures.push("README must identify the live Cell lock as owner authority");
if (!/reference application/i.test(readme)) failures.push("README must identify SkillPass Care as a reference application");

const deployment = JSON.parse(await readFile("deployments/testnet.example.json", "utf8"));
if (!String(deployment.codeHash || "").includes("REPLACE")) warnings.push("testnet.example.json no longer looks like a placeholder template; verify naming/status");
try {
  await access("package-lock.json");
} catch {
  warnings.push("package-lock.json is still missing; generate it from a networked environment before the final funding-candidate tag");
}

if (warnings.length) {
  console.warn("Funding-structure warnings:");
  for (const item of warnings) console.warn(`- ${item}`);
}
if (failures.length) {
  console.error("Funding-structure verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Funding-structure verification PASS.");
