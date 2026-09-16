#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { publicKeyFingerprint, verifyAuthorizationEvidence } from "@skillpass/provider-verifier";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

export async function verifyEvidenceFile({ file, publicKeyFile = "", fingerprint = "", now = Date.now() } = {}) {
  if (!file) throw new Error("evidence JSON file is required");
  const parsed = JSON.parse(await readFile(resolve(file), "utf8"));
  const evidence = parsed?.evidence && typeof parsed.evidence === "object" ? parsed.evidence : parsed;
  const publicKeyPem = publicKeyFile ? await readFile(resolve(publicKeyFile), "utf8") : "";
  const embeddedKey = String(evidence?.attestation?.publicKeyPem || "");
  const key = publicKeyPem || embeddedKey;
  const valid = verifyAuthorizationEvidence({ evidence, publicKeyPem, trustedFingerprint: fingerprint, now });
  return {
    valid,
    requestId: evidence?.requestId || null,
    evidenceHash: evidence?.evidenceHash || null,
    keyId: evidence?.attestation?.keyId || null,
    signerFingerprint: key ? publicKeyFingerprint(key) : null,
    trustPinned: Boolean(publicKeyFile || fingerprint),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";
  try {
    const result = await verifyEvidenceFile({ file, publicKeyFile: argValue("--public-key"), fingerprint: argValue("--fingerprint") });
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 2;
  } catch (error) {
    console.error(`evidence verification failed: ${error.message}`);
    console.error("Usage: node scripts/evidence-verify.mjs evidence.json [--public-key provider.pem] [--fingerprint sha256:...]");
    process.exitCode = 1;
  }
}
