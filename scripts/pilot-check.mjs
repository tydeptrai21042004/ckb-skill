#!/usr/bin/env node
const providers = [
  { base: process.env.SKILLPASS_PILOT_MODEL_URL || "http://127.0.0.1:8811", id: "provider-model-a", service: "model-api-v1" },
  { base: process.env.SKILLPASS_PILOT_DATA_URL || "http://127.0.0.1:8812", id: "provider-data-b", service: "private-data-api-v1" },
  { base: process.env.SKILLPASS_PILOT_COMPUTE_URL || "http://127.0.0.1:8813", id: "provider-compute-c", service: "compute-api-v1" },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--outpoint") args.outpoint = argv[++i];
  }
  return args;
}

function parseOutPoint(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(0x[0-9a-fA-F]{64}):((?:0x)?[0-9a-fA-F]+)$/);
  if (!match) throw new Error("--outpoint must be 0x<64-hex-tx-hash>:<index>");
  return { txHash: match[1].toLowerCase(), index: match[2].startsWith("0x") ? match[2].toLowerCase() : `0x${match[2].toLowerCase()}` };
}

async function readJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${body?.code || body?.error || "request_failed"}`);
  return body;
}

const { outpoint } = parseArgs(process.argv.slice(2));
const parsedOutPoint = parseOutPoint(outpoint);
const manifests = [];
for (const provider of providers) {
  const manifest = await readJson(`${provider.base}/api/provider-manifest`);
  if (manifest.provider?.id !== provider.id) throw new Error(`${provider.base}: expected provider ${provider.id}, got ${manifest.provider?.id}`);
  if (manifest.entitlementSynchronizationRequired !== false) throw new Error(`${provider.base}: provider must not require entitlement synchronization`);
  if (!Array.isArray(manifest.services) || manifest.services.length !== 1 || manifest.services[0].slug !== provider.service) {
    throw new Error(`${provider.base}: expected only ${provider.service}`);
  }
  manifests.push(manifest);
  console.log(`OK manifest ${manifest.provider.id}: ${provider.service} (${manifest.manifestHash})`);
}
if (new Set(manifests.map((item) => item.provider.id)).size !== providers.length) throw new Error("pilot providers are not independent identities");

if (parsedOutPoint) {
  const proofs = [];
  for (const provider of providers) {
    const proof = await readJson(`${provider.base}/api/capability/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outPoint: parsedOutPoint, service: provider.service }),
    });
    proofs.push(proof);
    console.log(`OK live CKB proof ${provider.id}: owner=${proof.capability?.currentOwnerLockHash}`);
  }
  const owners = new Set(proofs.map((proof) => proof.capability?.currentOwnerLockHash));
  const capabilityIds = new Set(proofs.map((proof) => proof.capability?.capabilityId));
  if (owners.size !== 1) throw new Error("providers disagree on current CKB owner");
  if (capabilityIds.size !== 1) throw new Error("providers disagree on Capability identity");
  console.log(`PASS: all three independent providers agree on live owner ${[...owners][0]}`);
} else {
  console.log("PASS: three independent provider manifests are healthy.");
  console.log("Tip: add --outpoint 0x<TX_HASH>:0x<INDEX> to prove all three see the same live CKB owner.");
}
