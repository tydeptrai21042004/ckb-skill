#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";

const path = process.argv[2] || "evidence/testnet/manifest.json";
const requireEvidence = process.argv.includes("--require") || process.env.SKILLPASS_REQUIRE_TESTNET_EVIDENCE === "1";

try {
  await access(path);
} catch {
  const message = `${path} is not present; real CKB Testnet lifecycle evidence has not been attached to this snapshot`;
  if (requireEvidence) {
    console.error(`Testnet evidence FAILED: ${message}`);
    process.exit(1);
  }
  console.warn(`Testnet evidence PENDING: ${message}`);
  process.exit(0);
}

const manifest = JSON.parse(await readFile(path, "utf8"));
const required = [
  "network", "sourceCommit", "protocolVersion", "codeHash", "hashType", "depTxHash", "depIndex",
  "issuerId", "serviceId", "capabilityId", "issueTxHash", "preTransferOutpoint", "transferTxHash", "postTransferOutpoint"
];
const failures = [];
for (const key of required) {
  if (manifest[key] === undefined || manifest[key] === null || String(manifest[key]).trim() === "") failures.push(`missing ${key}`);
  if (typeof manifest[key] === "string" && /REPLACE|TODO|EXAMPLE/i.test(manifest[key])) failures.push(`${key} still contains a placeholder`);
}
if (manifest.network !== "testnet") failures.push("network must be testnet for the funding pilot evidence");
for (const key of ["codeHash", "depTxHash", "issuerId", "serviceId", "capabilityId", "issueTxHash", "transferTxHash"]) {
  if (manifest[key] && !/^0x[0-9a-fA-F]{64}$/.test(String(manifest[key]))) failures.push(`${key} must be 32-byte 0x hex`);
}
for (const key of ["preTransferOutpoint", "postTransferOutpoint"]) {
  const value = manifest[key];
  if (!value || typeof value !== "object" || !/^0x[0-9a-fA-F]{64}$/.test(String(value.txHash || "")) || !Number.isInteger(value.index) || value.index < 0) {
    failures.push(`${key} must contain { txHash, index }`);
  }
}
if (failures.length) {
  console.error("Testnet evidence FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`Testnet evidence manifest PASS: ${path}`);
