#!/usr/bin/env node
/**
 * REAL testnet deployment + issued/transferred Capability lifecycle.
 * Uses a PUBLIC, disposable testnet-only key committed in testnet-wallets.mjs.
 * Never use this account for mainnet or valuable assets.
 * Never uses mocks. All proof is read back from CKB RPC nodes.
 */
import { ccc } from "@ckb-ccc/ccc";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  TESTNET_NETWORK, TESTNET_RPC_DEFAULT, TESTNET_RPC_SECONDARY,
  TESTNET_FUNDING_ADDRESS, TESTNET_BOB_ADDRESS, TESTNET_FUNDING_PRIVATE_KEY,
} from "./testnet-wallets.mjs";
import { createCkbRpc, getHistoricalCell, getTransaction, liveCellStatus, transactionConfirmations, transactionConsumesOutPoint, dataCodeHash } from "./ckb-rpc.mjs";
import { assessConsumptionProof } from "./spend-proof.mjs";
import { verifyManifestAgainstCkb } from "./testnet-evidence.mjs";
import { buildIssueCapabilityTx, buildTransferCapabilityTx } from "../packages/ckb-client/src/live.ts";
import { FLAG_TRANSFERABLE, FLAG_DELEGATABLE } from "@skillpass/capability-codec";
import { SERVICE_BUNDLE_V1_ENTITLEMENT_ID } from "@skillpass/capability-codec/service-ids";

const EVIDENCE = resolve(process.env.TESTNET_EVIDENCE_DIR || "evidence/testnet");
const PRIMARY_URL = process.env.CKB_RPC_URL || TESTNET_RPC_DEFAULT;
const SECONDARY_URL = process.env.CKB_SECONDARY_RPC_URL || TESTNET_RPC_SECONDARY;
const REUSE_DEPLOYMENT_FILE = String(process.env.CKB_REUSE_DEPLOYMENT_FILE || "").trim();
const hex32 = (input: unknown): input is `0x${string}` =>
  typeof input === "string" && /^0x[0-9a-fA-F]{64}$/.test(input);
const low = (input: unknown) => String(input ?? "").toLowerCase();
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function save(file: string, data: unknown) {
  const path = resolve(EVIDENCE, file);
  await mkdir(resolve(EVIDENCE, "providers"), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o644 });
  console.log(`Evidence saved: ${path}`);
}

async function requireTestnet(rpcUrl: string) {
  const parsed = new URL(rpcUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("For CI, CKB RPC must be a credential-free HTTPS URL");
  }
  const rpc = createCkbRpc(rpcUrl);
  const info = await rpc.call("get_blockchain_info", []);
  if (info?.chain !== TESTNET_NETWORK) {
    throw new Error(`REFUSING TO SIGN: ${parsed.host} reports chain=${JSON.stringify(info?.chain)}, expected ${TESTNET_NETWORK}`);
  }
  if (info.is_initial_block_download === true) {
    throw new Error(`${parsed.host} is still syncing and cannot attest finalized testnet state`);
  }
  return rpc;
}

/**
 * Fast read-only capacity preflight. Unlike signer.getBalance(), this uses one
 * bounded indexer request and does not enumerate every wallet Cell. Only cells
 * with empty data are counted, avoiding occupied capacity in data-bearing
 * Capability/contract Cells. This is a conservative funding estimate.
 */
async function getFundingCapacity(rpc: ReturnType<typeof createCkbRpc>, lock: ccc.Script): Promise<bigint> {
  const result = await rpc.call("get_cells_capacity", [{
    script: {code_hash: lock.codeHash, hash_type: lock.hashType, args: lock.args},
    script_type: "lock",
    script_search_mode: "exact",
    filter: {output_data_len_range: ["0x0", "0x1"]},
  }]);
  const capacity = result?.capacity;
  if (typeof capacity !== "string" || !/^0x[0-9a-fA-F]+$/.test(capacity)) {
    throw new Error("CKB indexer get_cells_capacity returned no valid capacity; cannot verify funding safely");
  }
  return BigInt(capacity);
}

async function awaitLive(rpc: ReturnType<typeof createCkbRpc>, outpoint: {txHash: string; index: number}) {
  for (let n = 0; n < 15; n++) {
    const status = await liveCellStatus(rpc, outpoint);
    if (status === "live") return;
    await sleep(3000);
  }
  throw new Error(`Expected ${outpoint.txHash}:${outpoint.index} live=true at ${new URL(rpc.endpoint).host}, RPC did not converge`);
}

/** Verify spent-Cell state using the actual committed transfer, not just "unknown".
 * An absent output also returns "unknown" on modern CKB RPC nodes.
 */
async function awaitConsumed(rpc: ReturnType<typeof createCkbRpc>, outpoint: {txHash: string; index: number}, transferHash: string) {
  let last: any = null;
  for (let n = 0; n < 24; n++) {
    try {
      const [status, spender, confirmation] = await Promise.all([
        liveCellStatus(rpc, outpoint),
        getTransaction(rpc, transferHash),
        transactionConfirmations(rpc, transferHash),
      ]);
      const proof = assessConsumptionProof({
        cellStatus: status,
        spendingTxStatus: confirmation.status,
        spendingConfirmations: confirmation.confirmations,
        spendingTxConsumesOutpoint: transactionConsumesOutPoint(spender.transaction, outpoint),
        minConfirmations: 1,
      });
      last = proof;
      if (proof.passed) return {rpcHost: new URL(rpc.endpoint).host, outpoint, spendingTxHash: transferHash, ...proof};
      // If the committed transaction does not spend the claimed Cell, polling
      // cannot correct that input mismatch: fail instead of passing by timeout.
      if (confirmation.status === "committed" && !proof.checks.spenderConsumesExactOutpoint) {
        throw new Error(`Confirmed transfer ${transferHash} does not consume ${outpoint.txHash}:${outpoint.index}`);
      }
    } catch (error: any) {
      if (String(error?.message || '').startsWith('Confirmed transfer ')) throw error;
      last = {rpcError: String(error?.message || error)};
    }
    await sleep(3000);
  }
  throw new Error(`Expected confirmed consumption of ${outpoint.txHash}:${outpoint.index} at ${new URL(rpc.endpoint).host}; last=${JSON.stringify(last)}`);
}

/** Separate Node processes run each provider policy using their own pinned configuration. */
async function checkProviders(args: {
  phase: "before" | "after";
  deployment: {codeHash: string; hashType: string};
  serviceId: string;
  issuerId: string;
  capabilityId: string;
  aliceLockHash: string;
  bobLockHash: string;
  pre: {txHash: string; index: number};
  post?: {txHash: string; index: number};
}) {
  const context = {
    codeHash: args.deployment.codeHash, hashType: args.deployment.hashType,
    serviceId: args.serviceId, issuerId: args.issuerId, capabilityId: args.capabilityId,
    aliceLockHash: args.aliceLockHash, bobLockHash: args.bobLockHash,
    pre: args.pre, post: args.post ?? null,
  };
  await save(`providers/ci-context-${args.phase}.json`, context);
  const exec = promisify(execFile);
  const providers = [];
  for (const [id, url] of [["provider-a", PRIMARY_URL], ["provider-b", SECONDARY_URL]] as const) {
    const config = {
      id, rpcUrl: url,
      codeHash: args.deployment.codeHash, hashType: args.deployment.hashType,
      serviceId: args.serviceId, trustedIssuerId: args.issuerId,
      minConfirmations: 1, ownerSourceOfTruth: "live-ckb-cell", entitlementDatabase: null,
    };
    await save(`providers/ci-${id}.json`, config);
    const outputFile = resolve(EVIDENCE, `providers/${id}-${args.phase}.json`);
    // Each invocation is an entirely fresh process, not two verifier calls in
    // the same process. This does not imply organizational independence.
    const { stdout, stderr } = await exec(process.execPath, [
      "scripts/ci-provider-worker.mjs", args.phase,
      resolve(EVIDENCE, `providers/ci-${id}.json`),
      resolve(EVIDENCE, `providers/ci-context-${args.phase}.json`), outputFile,
    ], {timeout: 120_000, maxBuffer: 1_000_000});
    if (stdout.trim()) console.log(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
    const report = JSON.parse(await readFile(outputFile, "utf8"));
    if (!report.passed || report.provider?.id !== id) throw new Error(`${id} failed independent process checks`);
    providers.push(report);
  }
  const report = {
    schemaVersion: 2, kind: "skillpass-real-testnet-separate-provider-processes",
    network: TESTNET_NETWORK, phase: args.phase, checkedAt: new Date().toISOString(),
    providers, passed: providers.length === 2 && providers.every(p => p.passed),
    independentOrganizationsVerified: false,
  };
  await save(`providers/lifecycle-${args.phase}.json`, report);
  if (!report.passed) throw new Error(`Provider checks FAILED in ${args.phase} phase`);
}

async function main() {
  await mkdir(EVIDENCE, {recursive: true});
  // Intentional PUBLIC testnet-only signer for zero-config GitHub Actions.
  // Do not fund this address with anything of real-world value.
  const secret = TESTNET_FUNDING_PRIVATE_KEY;
  if (!/^0x[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error("Hardcoded TESTNET_FUNDING_PRIVATE_KEY must have 64 hex digits");
  }
  if (!PRIMARY_URL.startsWith("https://") || !SECONDARY_URL.startsWith("https://")) {
    throw new Error("Real testnet RPC URLs must both be HTTPS");
  }
  if (new URL(PRIMARY_URL).host === new URL(SECONDARY_URL).host) {
    throw new Error("Provider RPC hosts must be different for the two-node testnet lifecycle gate");
  }
  // FIRST read the local binary; no network request is needed for size checks.
  // This is the exact RISC-V production ELF, not a placeholder or mock.
  const binary = new Uint8Array(await readFile("contracts/capability-type/build/release/capability-type"));
  if (binary.byteLength < 1024 || binary[0] !== 0x7f || binary[1] !== 0x45 || binary[2] !== 0x4c || binary[3] !== 0x46) {
    throw new Error("Compiled contract is absent, too small or not an ELF binary; run make -C contracts/capability-type build");
  }
  const codeHash = ccc.hashCkb(binary);
  const binarySha256 = `sha256:${createHash("sha256").update(binary).digest("hex")}`;
  const minimumCkb = REUSE_DEPLOYMENT_FILE ? 2000 : binary.byteLength + 2000;
  const lowerBound = ccc.fixedPointFrom(String(minimumCkb));
  console.log(`Preflight: RISC-V ELF=${binary.byteLength} bytes; minimum funding target ~${minimumCkb} CKB`);

  const sourceCommit = process.env.GITHUB_SHA || "local-run-without-git-sha";
  const start = {status: "started", network: TESTNET_NETWORK, aliceAddress: TESTNET_FUNDING_ADDRESS,
    bobAddress: TESTNET_BOB_ADDRESS, sourceCommit, contractBinarySha256: binarySha256,
    workflowRun: process.env.GITHUB_RUN_ID || null, checkedAt: new Date().toISOString()};
  await save("ci-stage.json", start);

  // Verify network identity, then query spendable wallet capacity directly on
  // the indexer. This happens BEFORE any CCC signer connection, Cell selection,
  // transaction construction, or secondary-provider checks.
  const primary = await requireTestnet(PRIMARY_URL);
  const client = new ccc.ClientPublicTestnet(PRIMARY_URL);
  if (low(client.addressPrefix) !== "ckt") throw new Error("Refusing non-testnet CCC client");
  const publiclyDecodedAlice = await ccc.Address.fromString(TESTNET_FUNDING_ADDRESS, client);
  const balance = await getFundingCapacity(primary, publiclyDecodedAlice.script);
  console.log(`Fast testnet wallet preflight: ${ccc.fixedPointToString(balance)} CKB available (empty-data cells); required ~${minimumCkb} CKB`);
  if (balance < lowerBound) {
    await save("ci-stage.json", {...start, status: "INSUFFICIENT_FUNDS",
      availableCKB: ccc.fixedPointToString(balance), requiredCKB: String(minimumCkb),
      contractBytes: binary.byteLength, codeHash});
    throw new Error(`Insufficient testnet funds: ${ccc.fixedPointToString(balance)} CKB available, ~${minimumCkb} CKB needed for ${binary.byteLength}-byte ELF. Stopping before slow wallet/network operations. Fund via https://faucet.nervos.org/ or reduce contract binary size.`);
  }

  // The funding preflight passed. Only now construct the signer and verify the
  // independent provider RPC. The checked address must match the signer key.
  const signer = new ccc.SignerCkbPrivateKey(client, secret);
  await signer.connect();
  const derivedAddress = await signer.getRecommendedAddress();
  if (derivedAddress !== TESTNET_FUNDING_ADDRESS) {
    throw new Error("The hardcoded testnet signing key does not match the funding address. Refusing to spend any CKB.");
  }
  const owner = await signer.getRecommendedAddressObj();
  const bob = await ccc.Address.fromString(TESTNET_BOB_ADDRESS, client);
  const aliceLockHash = owner.script.hash();
  const bobLockHash = bob.script.hash();
  if (low(aliceLockHash) === low(bobLockHash)) throw new Error("Alice and Bob must be distinct CKB locks");
  await requireTestnet(SECONDARY_URL);
  console.log(`REAL TESTNET (${TESTNET_NETWORK}); Alice: ${derivedAddress}; Bob: ${TESTNET_BOB_ADDRESS}`);
  console.log(`Primary RPC: ${new URL(PRIMARY_URL).host}; secondary: ${new URL(SECONDARY_URL).host}`);
  const sendTracked = async (tx: ccc.Transaction, stage: string, prior: Record<string, string>) => {
    const txHash = await signer.sendTransaction(tx);
    // Persist the real broadcast hash BEFORE waiting for a block. Never retry
    // an uncertain broadcast automatically: the first tx may have succeeded.
    await save("ci-stage.json", {...start, ...prior, status: `${stage}-broadcast`, [`${stage}TxHash`]: txHash});
    const confirmed = await signer.client.waitTransaction(txHash, 1, 300_000, 2_000);
    if (!confirmed) throw new Error(`Transaction ${stage} ${txHash} did not confirm in 300 seconds`);
    return txHash;
  };

  let deployHash: string;
  if (REUSE_DEPLOYMENT_FILE) {
    // Reuse the original known-good contract only after independent chain
    // verification against the exact ELF compiled from the current source.
    const existing = JSON.parse(await readFile(resolve(REUSE_DEPLOYMENT_FILE), "utf8"));
    if (existing.network !== "testnet" || existing.hashType !== "data2" ||
        !hex32(existing.codeHash) || low(existing.codeHash) !== low(codeHash) ||
        !hex32(existing.depTxHash) || existing.depIndex !== 0) {
      throw new Error("Refusing contract reuse: deployment descriptor does not match compiled testnet ELF or required outpoint");
    }
    deployHash = existing.depTxHash;
    await awaitLive(primary, {txHash: deployHash, index: 0});
    await awaitLive(await requireTestnet(SECONDARY_URL), {txHash: deployHash, index: 0});
    const deployedCell = await getHistoricalCell(primary, {txHash: deployHash, index: 0});
    if (dataCodeHash(deployedCell.outputData) !== low(codeHash) ||
        createHash("sha256").update(Buffer.from(deployedCell.outputData.slice(2), "hex")).digest("hex") !== binarySha256.slice(7)) {
      throw new Error("Refusing contract reuse: on-chain deployed bytecode differs from the compiled ELF");
    }
    console.log(`Verified and reused real Testnet deployment: ${deployHash}`);
  } else {
    const deployTx = ccc.Transaction.from({
      // Put the immutable code Cell under Bob's distinct lock: Alice's automatic
      // capacity selector cannot accidentally spend it as a fee.
      outputs: [{lock: bob.script}],
      outputsData: [ccc.hexFrom(binary)],
    });
    await deployTx.completeInputsByCapacity(signer);
    await deployTx.completeFeeBy(signer);
    deployHash = await sendTracked(deployTx, "deploy", {});
    await awaitLive(primary, {txHash: deployHash, index: 0});
    const deployedCell = await getHistoricalCell(primary, {txHash: deployHash, index: 0});
    if (dataCodeHash(deployedCell.outputData) !== low(codeHash)) {
      throw new Error("Deployed Cell data hash does not match compiled Capability Type Script!");
    }
  }
  const deployment = {
    network: "testnet" as const, codeHash,
    hashType: "data2" as const, depTxHash: deployHash, depIndex: 0,
  };
  await save("deployment.json", deployment);
  await save("ci-stage.json", {...start, status: REUSE_DEPLOYMENT_FILE ? "deployment-reused" : "deployed",
    deployTxHash: deployHash, codeHash});
  console.log(`Contract deployment confirmed (real tx): ${deployHash}`);

  const issue = await buildIssueCapabilityTx({
    signer, deployment, recipientAddress: derivedAddress,
    serviceId: SERVICE_BUNDLE_V1_ENTITLEMENT_ID,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30),
    flags: FLAG_TRANSFERABLE | FLAG_DELEGATABLE,
  });
  if (!hex32(issue.issuerId) || !hex32(issue.capabilityId)) throw new Error("Invalid issuance identifiers");
  const issueHash = await sendTracked(issue.tx, "issue", {deployTxHash: deployHash});
  const pre = {txHash: issueHash, index: 0};
  await awaitLive(primary, pre);
  const providerRpc = await requireTestnet(SECONDARY_URL);
  await awaitLive(providerRpc, pre);
  await save("ci-stage.json", {...start, status: "issued", deployTxHash: deployHash,
    issueTxHash: issueHash, codeHash, capabilityId: issue.capabilityId});
  const issuedCell = await getHistoricalCell(primary, pre);
  if (low(issuedCell.outputData) !== low(issue.data)) throw new Error("Issued on-chain data differs from submitted issuance data");
  if (low(issuedCell.lockHash) !== low(aliceLockHash)) throw new Error("Issued Cell owner is not Alice");

  const providerArgs = {
    deployment: {codeHash, hashType: deployment.hashType},
    serviceId: SERVICE_BUNDLE_V1_ENTITLEMENT_ID, issuerId: issue.issuerId,
    capabilityId: issue.capabilityId, aliceLockHash, bobLockHash, pre,
  };
  await checkProviders({...providerArgs, phase: "before"});

  const transferTx = await buildTransferCapabilityTx({
    signer, deployment, outPoint: {txHash: issueHash, index: 0},
    recipientAddress: TESTNET_BOB_ADDRESS,
  });
  const transferHash = await sendTracked(transferTx, "transfer", {deployTxHash: deployHash, issueTxHash: issueHash});
  const post = {txHash: transferHash, index: 0};
  await save("ci-stage.json", {...start, status: "transferred", deployTxHash: deployHash,
    issueTxHash: issueHash, transferTxHash: transferHash, codeHash, capabilityId: issue.capabilityId});
  const primarySpendProof = await awaitConsumed(primary, pre, transferHash);
  await awaitLive(primary, post);
  const secondarySpendProof = await awaitConsumed(providerRpc, pre, transferHash);
  await awaitLive(providerRpc, post);
  await save("spend-proofs.json", {schemaVersion: 1, network: TESTNET_NETWORK, primarySpendProof, secondarySpendProof});

  const manifest = {
    network: "testnet", sourceCommit, protocolVersion: "1.8.0", contractBinarySha256: binarySha256,
    codeHash, hashType: "data2", depTxHash: deployHash, depIndex: 0,
    issuerId: issue.issuerId, serviceId: SERVICE_BUNDLE_V1_ENTITLEMENT_ID,
    capabilityId: issue.capabilityId,
    issueTxHash: issueHash, preTransferOutpoint: pre,
    transferTxHash: transferHash, postTransferOutpoint: post,
    aliceLockHash, bobLockHash, minConfirmations: 1,
  };
  await save("manifest.json", manifest);
  await checkProviders({...providerArgs, post, phase: "after"});

  const report = await verifyManifestAgainstCkb({manifest, rpcUrl: PRIMARY_URL});
  await save("onchain-verification.json", report);
  if (!report.passed) {
    throw new Error("Real-chain manifest verification FAILED:\n" + report.failures.join("\n"));
  }
  const summary = {
    status: "PASSED", realChain: true, network: TESTNET_NETWORK,
    sourceCommit, contractBinarySha256: binarySha256,
    workflowRun: process.env.GITHUB_RUN_ID || null,
    issuerAliceAddress: derivedAddress, bobAddress: TESTNET_BOB_ADDRESS,
    codeHash, deployTxHash: deployHash, issueTxHash: issueHash, transferTxHash: transferHash,
    capabilityId: issue.capabilityId, checks: report.checks.length,
    providerChecks: "two separate CI verifier processes x before and after (lock-hash checks)", checkedAt: new Date().toISOString(),
  };
  await save("run-summary.json", summary);
  await save("ci-stage.json", {...start, status: "PASSED", deployTxHash: deployHash,
    issueTxHash: issueHash, transferTxHash: transferHash, codeHash, capabilityId: issue.capabilityId});
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## REAL CKB Pudge Testnet — PASSED\n\n` +
      `- **Deployment:** \`${deployHash}\`\n` +
      `- **Issue:** \`${issueHash}\`\n` +
      `- **Transfer Alice → Bob:** \`${transferHash}\`\n` +
      `- **Contract codeHash:** \`${codeHash}\`\n` +
      `- **Two separate provider-process checks:** before and after PASS (no independent operator or wallet-signature claim)\n` +
      `- **On-chain verification:** ${report.checks.length} checks PASS\n\n` +
      `All hashes are actual on-chain testnet transactions, not mocks.\n`);
  }
  console.log("REAL CKB TESTNET LIFECYCLE PASSED. See evidence artifacts for all hashes and RPC checks.");
}

// This is a one-shot GitHub Actions command, not a long-running service.
// CCC may retain RPC/polling handles after the final on-chain check. Once
// main() resolves, all evidence and GitHub summary writes have been awaited.
// Flush terminal output before exiting so GitHub Actions can advance.
void main().then(
  () => {
    process.stdout.write("", () => process.exit(0));
  },
  (error: any) => {
    console.error("REAL CKB TESTNET LIFECYCLE FAILED:", error?.stack || String(error));
    process.stderr.write("", () => process.exit(1));
  },
);
