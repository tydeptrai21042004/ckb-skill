import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const OUTPUT = join(ROOT, "dependency-versions.lock.json");
const EXACT = /^(?:\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|workspace:|file:|link:)/;

async function packageFiles() {
  const out = [join(ROOT, "package.json")];
  for (const base of ["apps", "packages"]) {
    for (const name of await readdir(join(ROOT, base))) out.push(join(ROOT, base, name, "package.json"));
  }
  const existing = [];
  for (const file of out) { try { await readFile(file); existing.push(file); } catch {} }
  return existing.sort();
}

const packages = {};
for (const file of await packageFiles()) {
  const raw = await readFile(file, "utf8");
  const pkg = JSON.parse(raw);
  const relative = file.slice(ROOT.length + 1).replaceAll("\\", "/");
  const dependencyGroups = {};
  for (const group of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (!pkg[group]) continue;
    const deps = Object.fromEntries(Object.entries(pkg[group]).sort(([a],[b]) => a.localeCompare(b)));
    for (const [name, version] of Object.entries(deps)) {
      if (name.startsWith("@skillpass/")) continue;
      if (!EXACT.test(String(version))) throw new Error(`${relative}: ${name} must use an exact version, got ${version}`);
    }
    dependencyGroups[group] = deps;
  }
  packages[relative] = {
    name: pkg.name || null,
    version: pkg.version || null,
    sha256: createHash("sha256").update(raw).digest("hex"),
    ...dependencyGroups,
  };
}
const lock = JSON.stringify({ lockVersion: 1, generatedFrom: "workspace-package-json", packages }, null, 2) + "\n";
if (process.argv.includes("--check")) {
  const current = await readFile(OUTPUT, "utf8").catch(() => "");
  if (current !== lock) { console.error("dependency-versions.lock.json is stale; run node scripts/dependency-lock.mjs"); process.exit(1); }
  console.log("dependency declaration lock is current");
} else {
  await writeFile(OUTPUT, lock);
  console.log("wrote dependency-versions.lock.json");
}
