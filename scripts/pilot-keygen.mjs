#!/usr/bin/env node
import { generateKeyPairSync, createPublicKey, createHash } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DIR = resolve(ROOT, ".runtime/pilot");
const providers = [
  ["provider-model-a", "provider-model-a.pem"],
  ["provider-data-b", "provider-data-b.pem"],
  ["provider-compute-c", "provider-compute-c.pem"],
];

function fingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return `sha256:${createHash("sha256").update(der).digest("hex")}`;
}

mkdirSync(DIR, { recursive: true, mode: 0o700 });
const trust = { version: 1, generatedAt: new Date().toISOString(), providers: {} };
for (const [providerId, fileName] of providers) {
  const path = resolve(DIR, fileName);
  if (!existsSync(path)) {
    const { privateKey } = generateKeyPairSync("ed25519");
    writeFileSync(path, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  }
  const privateKeyPem = readFileSync(path, "utf8");
  const publicKeyPem = createPublicKey(privateKeyPem).export({ type: "spki", format: "pem" }).toString();
  trust.providers[providerId] = { fingerprint: fingerprint(publicKeyPem), publicKeyPem };
}
const trustPath = resolve(DIR, "trust.json");
writeFileSync(trustPath, JSON.stringify(trust, null, 2) + "\n", { mode: 0o600 });
console.log(`Pilot provider keys ready: ${trustPath}`);
