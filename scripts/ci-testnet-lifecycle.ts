#!/usr/bin/env node
/**
 * REAL testnet deployment + issued/transferred Capability lifecycle.
 * Uses a PUBLIC, disposable testnet-only key committed in testnet-wallets.mjs.
 * Never use this account for mainnet or valuable assets.
 * Never uses mocks. All proof is read back from CKB RPC nodes.
 */
import { ccc } from "@ckb-ccc/ccc";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  TESTNET_NETWORK, TESTNET_RPC_DEFAULT, TESTNET_RPC_SECONDARY,
  TESTNET_FUNDING_ADDRESS, TESTNET_BOB_ADDRESS, TESTNET_FUNDING_PRIVATE_KEY,
} from "./testnet-wallets.mjs";
import { createCkbRpc, getHistoricalCell, getLiveCell, liveCellStatus, dataCodeHash } from "./ckb-rpc.mjs";
import { verifyManifestAgainstCkb } from "./testnet-evidence.mjs";
import { buildIssueCapabilityTx, buildTransferCapabilityTx } from "../packages/ckb-client/src/live.ts";
import { decodeCapability, FLAG_TRANSFERABLE, FLAG_DELEGATABLE } from "@skillpass/capability-codec";
import { SERVICE_BUNDLE_V1_ENTITLEMENT_ID } from "@skillpass/capability-codec/service-ids";
import { verifySkillPassAuthorization } from "@skillpass/provider-verifier";
import { createServicePolicy } from "@skillpass/service-rights";

const EVIDENCE = resolve(process.env.TESTNET_EVIDENCE_DIR || "evidence/testnet");
const PRIMARY_URL = process.env.CKB_RPC_URL || TESTNET_RPC_DEFAULT;
const SECONDARY_URL = process.env.CKB_SECONDARY_RPC_URL || TESTNET_RPC_SECONDARY;
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

async function awaitLive(rpc: ReturnType<typeof createCkbRpc>, outpoint: {txHash: string; index: number}, expected: boolean) {
  for (let n = 0; n < 15; n++) {
    const actual = (await liveCellStatus(rpc, outpoint)) === "live";
    if (actual === expected) return;
    await sleep(3000);
  }
  throw new Error(`Expected ${outpoint.txHash}:${outpoint.index} live=${expected}, RPC did not converge`);
}

/** Two independently configured provider instances query two actual RPC endpoints. */
async function checkProviders(args: {
  phase: "before" | "after";
  deployment: {codeHash: string; hashType: string};
  serviceId: string;
  issuerId: string;
  capabilityData: string;
  aliceLockHash: string;
  bobLockHash: string;
  pre: {txHash: string; index: number};
  post?: {txHash: string; index: number};
}) {
  const policy = createServicePolicy({
    serviceId: args.serviceId,
    trustedIssuerIds: [args.issuerId],
    requireTransferable: true,
  });
  const capability = decodeCapability(args.capabilityData);
  const providers = [];
  for (const [id, url] of [["provider-a", PRIMARY_URL], ["provider-b", SECONDARY_URL]] as const) {
    const rpc = await requireTestnet(url);
    const checks = args.phase === "before"
      ? [
          {id: "before-alice-allow", who: args.aliceLockHash, point: args.pre, expected: true},
          {id: "before-bob-deny", who: args.bobLockHash, point: args.pre, expected: false},
        ]
      : [
          {id: "after-alice-deny", who: args.aliceLockHash, point: args.pre, expected: false},
          {id: "after-bob-allow", who: args.bobLockHash, point: args.post!, expected: true},
        ];
    const results = [];
    for (const item of checks) {
      let allowed = false;
      let code = "ALLOW";
      try {
        const verdict = await verifySkillPassAuthorization({
          capability, policy, requesterLockHash: item.who,
          deployment: args.deployment,
          minConfirmations: 1,
          resolveLiveCell: async () => getLiveCell(rpc, item.point),
        });
        allowed = verdict.authorized === true;
        if (!allowed) code = "DENY";
      } catch (error: any) {
        code = String(error?.code || error?.name || "UNKNOWN_ERROR");
        // An RPC outage, failed finality check, wrong deployment or malformed
        // on-chain data is NOT evidence that the requester was correctly denied.
        // Only the two expected authorization failures count as a negative test.
        if (item.expected || !["NOT_OWNER", "CELL_NOT_LIVE"].includes(code)) throw error;
      }
      const passed = allowed === item.expected;
      results.push({id: item.id, expected: item.expected, actual: allowed, passed, code});
      console.log(`${passed ? "PASS" : "FAIL"} ${id} ${item.id}: ${allowed ? "allow" : "deny"}`);
    }
    providers.push({provider: {id}, rpcHost: new URL(url).host, results, passed: results.every((r) => r.passed)});
  }
  const report = {
    schemaVersion: 1, kind: "skillpass-real-testnet-independent-provider-lifecycle",
    network: TESTNET_NETWORK, phase: args.phase, checkedAt: new Date().toISOString(),
    providers, passed: providers.every((provider) => provider.passed),
  };
  await save(`providers/lifecycle-${args.phase}.json`, report);
  if (!report.passed) throw new Error(`Real testnet provider checks FAILED in ${args.phase} phase`);
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
  const primary = await requireTestnet(PRIMARY_URL);
  await requireTestnet(SECONDARY_URL);
  const client = new ccc.ClientPublicTestnet(PRIMARY_URL);
  const signer = new ccc.SignerCkbPrivateKey(client, secret);
  await signer.connect();
  const derivedAddress = await signer.getRecommendedAddress();
  if (derivedAddress !== TESTNET_FUNDING_ADDRESS) {
    throw new Error("The hardcoded testnet signing key does not match the funding address. Refusing to spend any CKB.");
  }
  if (low(client.addressPrefix) !== "ckt") throw new Error("Refusing non-testnet CCC client");
  const owner = await signer.getRecommendedAddressObj();
  const bob = await ccc.Address.fromString(TESTNET_BOB_ADDRESS, client);
  const aliceLockHash = owner.script.hash();
  const bobLockHash = bob.script.hash();
  if (low(aliceLockHash) === low(bobLockHash)) throw new Error("Alice and Bob must be distinct CKB locks");
  console.log(`REAL TESTNET (${TESTNET_NETWORK}); Alice: ${derivedAddress}; Bob: ${TESTNET_BOB_ADDRESS}`);
  console.log(`Primary RPC: ${new URL(PRIMARY_URL).host}; secondary: ${new URL(SECONDARY_URL).host}`);

  const sourceCommit = process.env.GITHUB_SHA || "local-run-without-git-sha";
  const start = {status: "started", network: TESTNET_NETWORK, aliceAddress: derivedAddress,
    bobAddress: TESTNET_BOB_ADDRESS, sourceCommit, checkedAt: new Date().toISOString()};
  await save("ci-stage.json", start);
  const sendTracked = async (tx: ccc.Transaction, stage: string, prior: Record<string, string>) => {
    const txHash = await signer.sendTransaction(tx);
    // Persist the real on-chain candidate hash BEFORE waiting for a block. If
    // the RPC confirmation call times out, the user can still recover evidence.
    await save("ci-stage.json", {...start, ...prior, status: `${stage}-broadcast`, [`${stage}TxHash`]: txHash});
    const confirmed = await signer.client.waitTransaction(txHash, 1, 300_000, 2_000);
    if (!confirmed) throw new Error(`Transaction ${stage} ${txHash} did not confirm in 300 seconds`);
    return txHash;
  };

  // This MUST be the compiled production RISC-V binary, never a placeholder.
  const binary = new Uint8Array(await readFile("contracts/capability-type/build/release/capability-type"));
  if (binary.byteLength < 1024 || binary[0] !== 0x7f || binary[1] !== 0x45 || binary[2] !== 0x4c || binary[3] !== 0x46) {
    throw new Error("Compiled contract is absent, too small or not an ELF binary; run make -C contracts/capability-type build");
  }
  const codeHash = ccc.hashCkb(binary);
  const balance = await signer.getBalance();
  console.log(`Testnet balance: ${ccc.fixedPointToString(balance)} CKB; contract ELF size ${binary.byteLength} bytes`);
  // CKB occupied capacity for a contract cell includes executable bytes. Require
  // a modest buffer above the ~bytes-as-CKB deposit, issuance and transaction fees.
  const lowerBound = ccc.fixedPointFrom(String(binary.byteLength + 2000));
  if (balance < lowerBound) {
    throw new Error(`Insufficient testnet funds: need at least ~${binary.byteLength + 2000} CKB (safe capacity buffer); fund the address through https://faucet.nervos.org/`);
  }

  const deployTx = ccc.Transaction.from({
    // Put the immutable code Cell under Bob's distinct lock: Alice's automatic
    // capacity selector cannot accidentally spend the deployed contract as a fee.
    outputs: [{lock: bob.script}],
    outputsData: [ccc.hexFrom(binary)],
  });
  await deployTx.completeInputsByCapacity(signer);
  await deployTx.completeFeeBy(signer);
  const deployHash = await sendTracked(deployTx, "deploy", {});
  const deployment = {
    network: "testnet" as const, codeHash,
    hashType: "data2" as const, depTxHash: deployHash, depIndex: 0,
  };
  await save("deployment.json", deployment);
  await save("ci-stage.json", {...start, status: "deployed", deployTxHash: deployHash, codeHash});
  console.log(`Contract deployed (real tx): ${deployHash}`);
  await awaitLive(primary, {txHash: deployHash, index: 0}, true);
  const deployedCell = await getHistoricalCell(primary, {txHash: deployHash, index: 0});
  if (dataCodeHash(deployedCell.outputData) !== low(codeHash)) {
    throw new Error("Deployed Cell data hash does not match compiled Capability Type Script!");
  }

  const issue = await buildIssueCapabilityTx({
    signer, deployment, recipientAddress: derivedAddress,
    serviceId: SERVICE_BUNDLE_V1_ENTITLEMENT_ID,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30),
    flags: FLAG_TRANSFERABLE | FLAG_DELEGATABLE,
  });
  if (!hex32(issue.issuerId) || !hex32(issue.capabilityId)) throw new Error("Invalid issuance identifiers");
  const issueHash = await sendTracked(issue.tx, "issue", {deployTxHash: deployHash});
  const pre = {txHash: issueHash, index: 0};
  await awaitLive(primary, pre, true);
  await save("ci-stage.json", {...start, status: "issued", deployTxHash: deployHash,
    issueTxHash: issueHash, codeHash, capabilityId: issue.capabilityId});
  const issuedCell = await getHistoricalCell(primary, pre);
  if (low(issuedCell.outputData) !== low(issue.data)) throw new Error("Issued on-chain data differs from submitted issuance data");
  if (low(issuedCell.lockHash) !== low(aliceLockHash)) throw new Error("Issued Cell owner is not Alice");

  const providerArgs = {
    deployment: {codeHash, hashType: deployment.hashType},
    serviceId: SERVICE_BUNDLE_V1_ENTITLEMENT_ID, issuerId: issue.issuerId,
    capabilityData: issue.data, aliceLockHash, bobLockHash, pre,
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
  await awaitLive(primary, pre, false);
  await awaitLive(primary, post, true);

  const manifest = {
    network: "testnet", sourceCommit, protocolVersion: "1.8.0",
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
    sourceCommit, issuerAliceAddress: derivedAddress, bobAddress: TESTNET_BOB_ADDRESS,
    codeHash, deployTxHash: deployHash, issueTxHash: issueHash, transferTxHash: transferHash,
    capabilityId: issue.capabilityId, checks: report.checks.length,
    providerChecks: "two providers x before and after", checkedAt: new Date().toISOString(),
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
      `- **Two-provider checks:** before and after PASS\n` +
      `- **On-chain verification:** ${report.checks.length} checks PASS\n\n` +
      `All hashes are actual on-chain testnet transactions, not mocks.\n`);
  }
  console.log("REAL CKB TESTNET LIFECYCLE PASSED. See evidence artifacts for all hashes and RPC checks.");
}

main().catch((error: any) => {
  console.error("REAL CKB TESTNET LIFECYCLE FAILED:", error?.stack || String(error));
  process.exitCode = 1;
});
