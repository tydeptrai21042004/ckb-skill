#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { decodeCapability } from "../packages/capability-codec/src/index.mjs";
import { createServicePolicy } from "@skillpass/service-rights";
import { verifySkillPassAuthorization } from "@skillpass/provider-verifier";
import { createCkbRpc, getHistoricalCell, getLiveCell } from "./ckb-rpc.mjs";
import { validateManifestShape } from "./testnet-evidence.mjs";

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function equalHex(a, b) { return String(a || "").toLowerCase() === String(b || "").toLowerCase(); }

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const key = process.argv[i];
    if (!key.startsWith("--")) continue;
    const next = process.argv[i + 1];
    args[key.slice(2)] = next && !next.startsWith("--") ? (i++, next) : true;
  }
  return args;
}

function validateProviderConfig(config, manifest) {
  const failures = [];
  if (!config?.provider?.id) failures.push("provider.id is required");
  if (!config?.rpcEnv) failures.push("rpcEnv is required");
  if (!equalHex(config?.capabilityDeployment?.codeHash, manifest.codeHash) || String(config?.capabilityDeployment?.hashType) !== String(manifest.hashType)) failures.push("provider must independently pin the manifest Capability deployment");
  if (!equalHex(config?.service?.id, manifest.serviceId)) failures.push("provider service.id must match the funded lifecycle serviceId");
  if (!(config?.trustedIssuerIds || []).some((id) => equalHex(id, manifest.issuerId))) failures.push("provider must explicitly trust the manifest issuerId");
  if (config?.ownerSourceOfTruth !== "live-ckb-cell") failures.push("ownerSourceOfTruth must be live-ckb-cell");
  if (config?.entitlementDatabase !== null) failures.push("entitlementDatabase must be null for the independent-provider proof");
  return failures;
}

async function authorize({ rpc, config, capability, outPoint, requesterLockHash }) {
  const policy = createServicePolicy({
    serviceId: config.service.id,
    trustedIssuerIds: config.trustedIssuerIds,
    requireTransferable: true,
  });
  try {
    const decision = await verifySkillPassAuthorization({
      capability,
      policy,
      requesterLockHash,
      deployment: config.capabilityDeployment,
      minConfirmations: Number(config.minConfirmations ?? 1),
      resolveLiveCell: async () => getLiveCell(rpc, outPoint),
    });
    return { allowed: decision.authorized === true, code: "ALLOW", currentOwnerLockHash: decision.currentOwnerLockHash };
  } catch (error) {
    return { allowed: false, code: String(error?.code || error?.name || "DENY") };
  }
}

export async function runIndependentProviderPhase({ phase, manifest, providerConfigs }) {
  if (!['before', 'after'].includes(phase)) throw new Error("phase must be before or after");
  const shapeFailures = validateManifestShape(manifest);
  if (shapeFailures.length) throw new Error(`manifest is not ready:\n- ${shapeFailures.join("\n- ")}`);
  const ids = providerConfigs.map((item) => item.provider?.id);
  if (new Set(ids).size !== providerConfigs.length) throw new Error("provider IDs must be distinct");

  const reports = [];
  for (const config of providerConfigs) {
    const failures = validateProviderConfig(config, manifest);
    if (failures.length) throw new Error(`${config?.provider?.id || "provider"}: ${failures.join("; ")}`);
    const rpcUrl = process.env[config.rpcEnv] || config.rpcUrl;
    if (!rpcUrl) throw new Error(`${config.provider.id}: set ${config.rpcEnv}; each provider owns its RPC configuration`);
    const rpc = createCkbRpc(rpcUrl);
    const sourceOutPoint = phase === "before" ? manifest.preTransferOutpoint : manifest.postTransferOutpoint;
    const historical = await getHistoricalCell(rpc, sourceOutPoint);
    const capability = decodeCapability(historical.outputData);
    if (capability.version === 2 && Number(capability.bindingMode || 0) !== 0) {
      throw new Error(`${config.provider.id}: this CLI proof currently supports holder-bound capabilities; use the provider's subject resolver adapter for subject-bound V2 rights`);
    }

    const cases = phase === "before" ? [
      { id: "before-alice-allow", outPoint: manifest.preTransferOutpoint, requesterLockHash: manifest.aliceLockHash, expected: true },
      { id: "before-bob-deny", outPoint: manifest.preTransferOutpoint, requesterLockHash: manifest.bobLockHash, expected: false },
    ] : [
      { id: "after-alice-deny", outPoint: manifest.preTransferOutpoint, requesterLockHash: manifest.aliceLockHash, expected: false },
      { id: "after-bob-allow", outPoint: manifest.postTransferOutpoint, requesterLockHash: manifest.bobLockHash, expected: true },
    ];
    const results = [];
    for (const item of cases) {
      const decision = await authorize({ rpc, config, capability, outPoint: item.outPoint, requesterLockHash: item.requesterLockHash });
      results.push({ ...item, actual: decision.allowed, code: decision.code, passed: decision.allowed === item.expected });
    }
    reports.push({
      provider: config.provider,
      phase,
      rpcHost: new URL(rpc.endpoint).host,
      configHash: `sha256:${sha256(canonical({ ...config, rpcUrl: undefined }))}`,
      ownerSourceOfTruth: config.ownerSourceOfTruth,
      entitlementDatabase: config.entitlementDatabase,
      results,
      passed: results.every((item) => item.passed),
    });
  }
  return {
    schemaVersion: 1,
    kind: "skillpass-independent-provider-lifecycle",
    phase,
    checkedAt: new Date().toISOString(),
    capabilityId: manifest.capabilityId,
    providers: reports,
    passed: reports.length >= 2 && reports.every((item) => item.passed),
  };
}

async function main() {
  const args = parseArgs();
  const phase = String(args.phase || "");
  const manifestPath = String(args.manifest || "evidence/testnet/manifest.json");
  const providerPaths = String(args.providers || "evidence/testnet/providers/provider-a.json,evidence/testnet/providers/provider-b.json").split(",").map((v) => v.trim()).filter(Boolean);
  if (providerPaths.length < 2) throw new Error("at least two independent provider config files are required");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const providerConfigs = await Promise.all(providerPaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  const report = await runIndependentProviderPhase({ phase, manifest, providerConfigs });
  const out = resolve(String(args.out || `evidence/testnet/providers/lifecycle-${phase}.json`));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  for (const provider of report.providers) {
    for (const item of provider.results) console.log(`${item.passed ? "PASS" : "FAIL"} ${provider.provider.id}: ${item.id} expected=${item.expected ? "allow" : "deny"} actual=${item.actual ? "allow" : "deny"} code=${item.code}`);
  }
  if (!report.passed) {
    console.error(`Independent provider ${phase} lifecycle FAILED; evidence written to ${out}`);
    process.exitCode = 1;
  } else {
    console.log(`Independent provider ${phase} lifecycle PASS; evidence written to ${out}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(`Independent provider lifecycle FAILED: ${error.message}`); process.exitCode = 1; });
}
