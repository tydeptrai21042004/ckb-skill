#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const careRoot = resolve(process.argv[2] || process.env.SKILLPASS_CARE_REPO || "../SkillPass-Care-main");
const expected = JSON.parse(await readFile("reference-apps/skillpass-care.json", "utf8"));
const actual = JSON.parse(await readFile(resolve(careRoot, "skillpass.protocol.json"), "utf8"));
const failures = [];
if (actual.canonicalProtocol !== "SkillPass") failures.push("Care canonicalProtocol is not SkillPass");
if (actual.canonicalCapabilityVersion !== expected.canonicalCapabilityVersion) failures.push("Capability version mismatch");
for (const [name, version] of Object.entries(expected.protocolPackages)) {
  if (actual.expectedPackages?.[name] !== version) failures.push(`${name}: Care expects ${actual.expectedPackages?.[name] ?? "missing"}, SkillPass reference expects ${version}`);
}
if (actual.mapping?.currentOwner !== "live Cell.lock (never Care application JSON)") failures.push("Care owner-authority contract changed");
if (failures.length) {
  console.error("Care compatibility FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Care compatibility PASS against ${careRoot}`);
