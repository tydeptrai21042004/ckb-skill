#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import { decodeCapability, encodeTypeArgs } from "../packages/capability-codec/src/index.mjs";
import {
  createCkbRpc,
  dataCodeHash,
  getHistoricalCell,
  getTransaction,
  liveCellStatus,
  scriptHash,
  transactionConsumesOutPoint,
} from "./ckb-rpc.mjs";

export function validateManifestShape(manifest) {
  const required = [
    "network", "sourceCommit", "protocolVersion", "codeHash", "hashType", "depTxHash", "depIndex",
    "issuerId", "serviceId", "capabilityId", "issueTxHash", "preTransferOutpoint", "transferTxHash", "postTransferOutpoint",
    "aliceLockHash", "bobLockHash",
  ];
  const failures = [];
  for (const key of required) {
    if (manifest[key] === undefined || manifest[key] === null || String(manifest[key]).trim() === "") failures.push(`missing ${key}`);
    if (typeof manifest[key] === "string" && /REPLACE|TODO|EXAMPLE/i.test(manifest[key])) failures.push(`${key} still contains a placeholder`);
  }
  if (manifest.network !== "testnet") failures.push("network must be testnet for the funding pilot evidence");
  if (!Number.isInteger(manifest.depIndex) || manifest.depIndex < 0) failures.push("depIndex must be a non-negative integer");
  if (!["data", "data1", "data2", "type"].includes(String(manifest.hashType || ""))) failures.push("hashType must be data, data1, data2, or type");
  for (const key of ["codeHash", "depTxHash", "issuerId", "serviceId", "capabilityId", "issueTxHash", "transferTxHash", "aliceLockHash", "bobLockHash"]) {
    if (manifest[key] && !/^0x[0-9a-fA-F]{64}$/.test(String(manifest[key]))) failures.push(`${key} must be 32-byte 0x hex`);
  }
  for (const key of ["preTransferOutpoint", "postTransferOutpoint"]) {
    const value = manifest[key];
    if (!value || typeof value !== "object" || !/^0x[0-9a-fA-F]{64}$/.test(String(value.txHash || "")) || !Number.isInteger(value.index) || value.index < 0) {
      failures.push(`${key} must contain { txHash, index }`);
    }
  }
  if (manifest.preTransferOutpoint?.txHash && String(manifest.preTransferOutpoint.txHash).toLowerCase() !== String(manifest.issueTxHash || "").toLowerCase()) {
    failures.push("preTransferOutpoint.txHash must equal issueTxHash");
  }
  if (manifest.postTransferOutpoint?.txHash && String(manifest.postTransferOutpoint.txHash).toLowerCase() !== String(manifest.transferTxHash || "").toLowerCase()) {
    failures.push("postTransferOutpoint.txHash must equal transferTxHash");
  }
  return failures;
}

function equalHex(a, b) { return String(a || "").toLowerCase() === String(b || "").toLowerCase(); }
function equalScript(a, b) {
  return Boolean(a && b) && equalHex(a.codeHash, b.codeHash) && String(a.hashType) === String(b.hashType) && equalHex(a.args, b.args);
}

export async function verifyManifestAgainstCkb({ manifest, rpcUrl } = {}) {
  const failures = validateManifestShape(manifest);
  if (failures.length) return { passed: false, failures, checks: [] };
  const rpc = createCkbRpc(rpcUrl || process.env.CKB_RPC_URL || "https://testnet.ckb.dev");
  const checks = [];
  const check = (condition, message) => {
    checks.push({ passed: Boolean(condition), message });
    if (!condition) failures.push(message);
  };

  const depOutPoint = { txHash: manifest.depTxHash, index: manifest.depIndex };
  const [depCell, pre, post, transferRecord] = await Promise.all([
    getHistoricalCell(rpc, depOutPoint),
    getHistoricalCell(rpc, manifest.preTransferOutpoint),
    getHistoricalCell(rpc, manifest.postTransferOutpoint),
    getTransaction(rpc, manifest.transferTxHash),
  ]);

  const expectedCodeHash = manifest.hashType === "type" ? scriptHash(depCell.cellOutput.type) : dataCodeHash(depCell.outputData);
  check(equalHex(expectedCodeHash, manifest.codeHash), "contract deployment output resolves to the declared codeHash");

  check(equalScript(pre.cellOutput.type, post.cellOutput.type), "Capability Type Script is identical before and after transfer");
  check(equalHex(pre.outputData, post.outputData), "Capability data is byte-identical before and after transfer");
  check(equalHex(pre.cellOutput.type?.codeHash, manifest.codeHash) && pre.cellOutput.type?.hashType === manifest.hashType, "pre-transfer Cell uses the declared Capability deployment");
  check(equalHex(post.cellOutput.type?.codeHash, manifest.codeHash) && post.cellOutput.type?.hashType === manifest.hashType, "post-transfer Cell uses the declared Capability deployment");

  let capability = null;
  try { capability = decodeCapability(pre.outputData); }
  catch (error) { failures.push(`pre-transfer Capability data cannot be decoded: ${error.message}`); }
  if (capability) {
    check(equalHex(capability.issuerId, manifest.issuerId), "Capability issuerId matches the manifest");
    check(equalHex(capability.serviceId, manifest.serviceId), "Capability serviceId matches the manifest");
    check(equalHex(capability.capabilityId, manifest.capabilityId), "Capability capabilityId matches the manifest");
    check(equalHex(pre.cellOutput.type?.args, encodeTypeArgs(capability)), "Capability Type args match issuerId + capabilityId");
  }

  check(equalHex(pre.lockHash, manifest.aliceLockHash), "pre-transfer Cell lock hash belongs to Alice");
  check(equalHex(post.lockHash, manifest.bobLockHash), "post-transfer Cell lock hash belongs to Bob");
  check(!equalHex(manifest.aliceLockHash, manifest.bobLockHash), "Alice and Bob lock hashes are distinct");
  check(transactionConsumesOutPoint(transferRecord.transaction, manifest.preTransferOutpoint), "transfer transaction consumes Alice's Capability outpoint");

  const [preStatus, postStatus] = await Promise.all([
    liveCellStatus(rpc, manifest.preTransferOutpoint),
    liveCellStatus(rpc, manifest.postTransferOutpoint),
  ]);
  check(preStatus !== "live", `Alice pre-transfer outpoint is no longer live (status=${preStatus})`);
  check(postStatus === "live", `Bob successor Capability outpoint is live (status=${postStatus})`);
  check(post.confirmations >= Number(manifest.minConfirmations ?? 1), `Bob successor Cell has required confirmations (${post.confirmations})`);

  return {
    passed: failures.length === 0,
    rpcEndpoint: new URL(rpc.endpoint).host,
    checkedAt: new Date().toISOString(),
    confirmations: { deployment: depCell.confirmations, issue: pre.confirmations, transfer: post.confirmations },
    failures,
    checks,
  };
}

async function main() {
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const path = positional[0] || "evidence/testnet/manifest.json";
  const requireEvidence = process.argv.includes("--require") || process.env.SKILLPASS_REQUIRE_TESTNET_EVIDENCE === "1";
  const shapeOnly = process.argv.includes("--shape-only");
  try {
    await access(path);
  } catch {
    const message = `${path} is not present; real CKB Testnet lifecycle evidence has not been attached to this snapshot`;
    if (requireEvidence) {
      console.error(`Testnet evidence FAILED: ${message}`);
      process.exit(1);
    }
    console.warn(`Testnet evidence PENDING: ${message}`);
    return;
  }

  const manifest = JSON.parse(await readFile(path, "utf8"));
  const shapeFailures = validateManifestShape(manifest);
  if (shapeFailures.length) {
    console.error("Testnet evidence FAILED:\n- " + shapeFailures.join("\n- "));
    process.exit(1);
  }
  if (shapeOnly) {
    console.log(`Testnet evidence manifest shape PASS: ${path}`);
    return;
  }

  const report = await verifyManifestAgainstCkb({ manifest, rpcUrl: process.env.CKB_RPC_URL });
  if (!report.passed) {
    console.error("Testnet RPC evidence FAILED:\n- " + report.failures.join("\n- "));
    process.exit(1);
  }
  for (const item of report.checks) console.log(`PASS: ${item.message}`);
  console.log(`Testnet RPC evidence PASS: ${path} via ${report.rpcEndpoint}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Testnet evidence FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
