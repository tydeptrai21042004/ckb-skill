#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { args[key] = next; i += 1; }
    else args[key] = true;
  }
  return args;
}

function assertProviderId(value) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9_.:-]{0,127}$/i.test(id)) throw new Error("--provider-id must be 1..128 safe identifier characters");
  return id;
}
function assertSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) throw new Error("--service-slug must be 1..64 lowercase letters, numbers, or hyphens");
  return slug;
}
function assertHex32(value, label) {
  const hex = String(value || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hex)) throw new Error(`${label} must be 0x + 64 hex characters`);
  return hex;
}

export function buildProviderScaffold({ providerId, providerName, serviceSlug, serviceName, serviceId, issuerId, codeHash, hashType = "data2", minConfirmations = 1 } = {}) {
  const normalizedProviderId = assertProviderId(providerId);
  const normalizedSlug = assertSlug(serviceSlug);
  const normalizedServiceId = assertHex32(serviceId, "--service-id");
  const normalizedIssuerId = assertHex32(issuerId, "--issuer-id");
  const normalizedCodeHash = assertHex32(codeHash, "--code-hash");
  if (!["data", "type", "data1", "data2"].includes(String(hashType))) throw new Error("--hash-type must be data, type, data1, or data2");
  const confirmations = Number(minConfirmations);
  if (!Number.isSafeInteger(confirmations) || confirmations < 0 || confirmations > 10_000) throw new Error("--min-confirmations must be 0..10000");
  const displayProvider = String(providerName || normalizedProviderId).trim().slice(0, 120);
  const displayService = String(serviceName || normalizedSlug).trim().slice(0, 120);
  const config = {
    schemaVersion: "1.0",
    provider: { id: normalizedProviderId, name: displayProvider },
    service: { slug: normalizedSlug, name: displayService, id: normalizedServiceId },
    capabilityDeployment: { codeHash: normalizedCodeHash, hashType: String(hashType) },
    trustedIssuerIds: [normalizedIssuerId],
    minConfirmations: confirmations,
  };
  const verifier = `import { verifySkillPassAuthorization } from "@skillpass/provider-verifier";\nimport { createServicePolicy } from "@skillpass/service-rights";\nimport config from "./skillpass-provider.config.json" with { type: "json" };\n\nconst policy = createServicePolicy({\n  serviceId: config.service.id,\n  trustedIssuerIds: config.trustedIssuerIds,\n  requireTransferable: true,\n});\n\n/**\n * Wire resolveLiveCell() to YOUR OWN CKB RPC/indexer. It must return the live\n * Cell with outputData, Cell output type+lock information, lockHash and a\n * confirmations count. SkillPass does not require a shared entitlement DB.\n */\nexport async function authorizeSkillPass({ capability, requesterLockHash, resolveLiveCell, nowUnixSeconds }) {\n  return verifySkillPassAuthorization({\n    capability,\n    requesterLockHash,\n    resolveLiveCell,\n    deployment: config.capabilityDeployment,\n    minConfirmations: config.minConfirmations,\n    policy,\n    ...(nowUnixSeconds !== undefined ? { nowUnixSeconds } : {}),\n  });\n}\n`;
  const readme = `# ${displayProvider} × SkillPass\n\nThis folder is a clean-room provider integration scaffold. The provider keeps its own CKB RPC/indexer, keys, service policy, and protected endpoint. SkillPass only supplies verification primitives.\n\n## Integration boundary\n\n1. Resolve the referenced Capability outpoint from your own CKB infrastructure.\n2. Pass the live Cell to \`authorizeSkillPass()\`.\n3. The SDK verifies the accepted Capability Type Script deployment, Capability identity, finality threshold, trusted issuer, service policy, and current owner.\n4. Execute your protected service only after authorization succeeds.\n\nNo provider entitlement database synchronization is required.\n\n## Files\n\n- \`skillpass-provider.config.json\`: deployment and provider policy inputs.\n- \`verify-request.mjs\`: safe high-level verifier wrapper.\n- \`.env.example\`: suggested provider runtime settings.\n\n## Next verification\n\nRun one Alice → Bob lifecycle and preserve the CKB transaction hashes plus authorization evidence from both before and after transfer.\n`;
  const env = `SKILLPASS_PROVIDER_ID=${normalizedProviderId}\nSKILLPASS_PROVIDER_NAME=${displayProvider.replace(/\n/g, " ")}\nSKILLPASS_MIN_CAPABILITY_CONFIRMATIONS=${confirmations}\n# Provider-owned RPC/indexer endpoint used by your resolveLiveCell implementation:\nCKB_RPC_URL=https://your-ckb-rpc.example\n`;
  const packageJson = {
    name: `${normalizedProviderId.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-skillpass-integration`,
    private: true,
    type: "module",
    dependencies: {
      "@skillpass/provider-verifier": "1.0.0",
      "@skillpass/service-rights": "1.0.0",
    },
  };
  return { config, verifier, readme, env, packageJson };
}

export async function writeProviderScaffold({ outDir, ...options } = {}) {
  const target = resolve(String(outDir || "skillpass-provider-kit"));
  const files = buildProviderScaffold(options);
  await mkdir(target, { recursive: true });
  await Promise.all([
    writeFile(resolve(target, "skillpass-provider.config.json"), `${JSON.stringify(files.config, null, 2)}\n`),
    writeFile(resolve(target, "verify-request.mjs"), files.verifier),
    writeFile(resolve(target, "README.md"), files.readme),
    writeFile(resolve(target, ".env.example"), files.env),
    writeFile(resolve(target, "package.json"), `${JSON.stringify(files.packageJson, null, 2)}\n`),
  ]);
  return target;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const target = await writeProviderScaffold({
      outDir: args.out,
      providerId: args["provider-id"], providerName: args["provider-name"],
      serviceSlug: args["service-slug"], serviceName: args["service-name"],
      serviceId: args["service-id"], issuerId: args["issuer-id"],
      codeHash: args["code-hash"], hashType: args["hash-type"] || "data2",
      minConfirmations: args["min-confirmations"] ?? 1,
    });
    console.log(`SkillPass provider scaffold written to ${target}`);
  } catch (error) {
    console.error(`provider scaffold failed: ${error.message}`);
    console.error("Required: --provider-id --service-slug --service-id --issuer-id --code-hash [--out DIR]");
    process.exitCode = 1;
  }
}
