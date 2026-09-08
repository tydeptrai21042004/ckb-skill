import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function packageJsonFiles(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, "package.json"))
    .filter((file) => existsSync(file));
}

test("all internal @skillpass dependencies match local workspace versions", () => {
  const files = [
    ...packageJsonFiles("apps"),
    ...packageJsonFiles("packages"),
  ];

  const manifests = files.map((file) => ({ file, manifest: readJson(file) }));
  const versions = new Map(
    manifests
      .filter(({ manifest }) => manifest.name?.startsWith("@skillpass/") && manifest.version)
      .map(({ manifest }) => [manifest.name, manifest.version]),
  );

  const mismatches = [];
  for (const { file, manifest } of manifests) {
    for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, requested] of Object.entries(manifest[section] ?? {})) {
        if (!versions.has(name)) continue;
        const local = versions.get(name);
        if (requested !== local) {
          mismatches.push(`${file}: ${section}.${name}=${requested}, local=${local}`);
        }
      }
    }
  }

  assert.deepEqual(
    mismatches,
    [],
    `Internal workspace version mismatch(es) would make npm fetch private @skillpass packages from the registry:\n${mismatches.join("\n")}`,
  );
});
