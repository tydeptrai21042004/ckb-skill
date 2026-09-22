#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateManifestShape } from "./testnet-evidence.mjs";

const manifestPath = process.argv[2] || "evidence/testnet/manifest.json";
const outDir = resolve(process.argv[3] || "evidence/testnet/providers");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = validateManifestShape(manifest);
if (failures.length) throw new Error(`manifest is not ready:\n- ${failures.join("\n- ")}`);
await mkdir(outDir, { recursive: true });

function config(id, name, rpcEnv) {
  return {
    schemaVersion: 1,
    provider: { id, name },
    rpcEnv,
    capabilityDeployment: { codeHash: manifest.codeHash, hashType: manifest.hashType },
    service: { id: manifest.serviceId },
    trustedIssuerIds: [manifest.issuerId],
    minConfirmations: Number(manifest.minConfirmations ?? 1),
    ownerSourceOfTruth: "live-ckb-cell",
    entitlementDatabase: null,
  };
}

for (const [name, value] of [
  ["provider-a.json", config("provider-a", "Independent Provider A", "PROVIDER_A_CKB_RPC_URL")],
  ["provider-b.json", config("provider-b", "Independent Provider B", "PROVIDER_B_CKB_RPC_URL")],
]) {
  await writeFile(resolve(outDir, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`${name} already exists; refusing to overwrite an independent provider configuration`);
  });
}
console.log(`Independent provider configs created in ${outDir}`);
console.log("Set PROVIDER_A_CKB_RPC_URL and PROVIDER_B_CKB_RPC_URL, then run the before/after lifecycle checks.");
