import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from "node:crypto";
import { authorizeRequest, verifyServicePolicy, verifySubjectBinding } from "@skillpass/service-rights";

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function b64url(value) { return Buffer.from(value).toString("base64url"); }
function fromB64url(value) { return Buffer.from(String(value), "base64url"); }
function digestHex(value) { return createHash("sha256").update(value).digest("hex"); }

export function providerIdDigest(providerId) {
  return `0x${digestHex(String(providerId || ""))}`;
}

export function publicKeyFromPrivateKey(privateKeyPem) {
  return createPublicKey(createPrivateKey(String(privateKeyPem || ""))).export({ type: "spki", format: "pem" }).toString();
}

/** Stable SHA-256 fingerprint for an Ed25519/SPKI public key. */
export function publicKeyFingerprint(publicKeyPem) {
  const der = createPublicKey(String(publicKeyPem || "")).export({ type: "spki", format: "der" });
  return `sha256:${digestHex(der)}`;
}

/** Reusable provider-side verifier. Chain and subject resolution stay provider-owned. */
export async function verifyProviderAuthorization({
  capability,
  policy,
  requesterLockHash,
  resolveLiveCell,
  resolveSubject = null,
  nowUnixSeconds = BigInt(Math.floor(Date.now() / 1000)),
  paymentRequired = false,
  paymentVerified = false,
} = {}) {
  if (typeof resolveLiveCell !== "function") throw new Error("resolveLiveCell is required");
  const cell = await resolveLiveCell(capability);
  verifyServicePolicy({ capability, policy, nowUnixSeconds });
  let subject = null;
  if (capability?.version === 2 && capability.bindingMode !== 0) {
    if (typeof resolveSubject !== "function") {
      const error = new Error("subject-bound capability requires a provider subject resolver");
      error.code = "SUBJECT_RESOLVER_UNAVAILABLE";
      throw error;
    }
    subject = await resolveSubject(capability);
    verifySubjectBinding({ capability, capabilityOwnerLockHash: cell.lockHash, subject });
  }
  return authorizeRequest({ cell, capability, requesterLockHash, policy, nowUnixSeconds, paymentRequired, paymentVerified, subject });
}

function signingMaterial(label, payload) { return `${label}\n${canonical(payload)}`; }

export function signProviderManifest({ manifest, privateKeyPem, keyId = "provider-default", issuedAt = new Date().toISOString(), expiresAt = "" } = {}) {
  if (!manifest || typeof manifest !== "object") throw new Error("manifest is required");
  const privateKey = createPrivateKey(String(privateKeyPem || ""));
  const unsigned = { ...manifest };
  delete unsigned.signature;
  delete unsigned.manifestHash;
  const manifestHash = digestHex(canonical(unsigned));
  const envelope = { version: 1, keyId: String(keyId), algorithm: "Ed25519", manifestHash: `sha256:${manifestHash}`, issuedAt: String(issuedAt), expiresAt: String(expiresAt || "") };
  const signature = sign(null, Buffer.from(signingMaterial("SkillPass Provider Manifest v1", envelope)), privateKey).toString("base64url");
  const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  return Object.freeze({ ...unsigned, manifestHash: envelope.manifestHash, signature: Object.freeze({ ...envelope, value: signature, publicKeyPem }) });
}

/**
 * Signature/tamper verification. For trust decisions, prefer
 * verifyTrustedProviderManifest() so the key is pinned independently.
 */
export function verifyProviderManifest({ signedManifest, publicKeyPem, now = Date.now() } = {}) {
  const signature = signedManifest?.signature;
  if (!signature || signature.algorithm !== "Ed25519" || !signature.value) return false;
  const unsigned = { ...signedManifest };
  delete unsigned.signature;
  delete unsigned.manifestHash;
  const expectedHash = `sha256:${digestHex(canonical(unsigned))}`;
  if (expectedHash !== signature.manifestHash || expectedHash !== signedManifest.manifestHash) return false;
  if (signature.expiresAt && Number.isFinite(Date.parse(signature.expiresAt)) && now >= Date.parse(signature.expiresAt)) return false;
  const envelope = { version: signature.version, keyId: signature.keyId, algorithm: signature.algorithm, manifestHash: signature.manifestHash, issuedAt: signature.issuedAt, expiresAt: signature.expiresAt || "" };
  try {
    return verify(null, Buffer.from(signingMaterial("SkillPass Provider Manifest v1", envelope)), createPublicKey(publicKeyPem || signature.publicKeyPem), fromB64url(signature.value));
  } catch {
    return false;
  }
}

/**
 * Verify a provider manifest against an independently trusted key or key
 * fingerprint. This closes the self-signed trust-bootstrap gap: the manifest
 * may publish a key for convenience, but it cannot choose the key that the
 * verifier trusts.
 */
export function verifyTrustedProviderManifest({ signedManifest, trustedPublicKeyPem = "", trustedFingerprint = "", now = Date.now() } = {}) {
  const embedded = String(signedManifest?.signature?.publicKeyPem || "");
  const key = String(trustedPublicKeyPem || embedded);
  if (!key) return false;
  if (!trustedPublicKeyPem && !trustedFingerprint) return false;
  if (trustedFingerprint && publicKeyFingerprint(key) !== String(trustedFingerprint).toLowerCase()) return false;
  if (trustedPublicKeyPem && embedded && publicKeyFingerprint(embedded) !== publicKeyFingerprint(trustedPublicKeyPem)) return false;
  return verifyProviderManifest({ signedManifest, publicKeyPem: key, now });
}

export function createGatewayAssertion({ claims, privateKeyPem, keyId = "gateway-default", ttlSeconds = 30, now = Date.now() } = {}) {
  if (!claims || typeof claims !== "object") throw new Error("claims are required");
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) throw new Error("ttlSeconds must be 1..300");
  const payload = Object.freeze({ version: 1, ...claims, keyId: String(keyId), issuedAt: now, expiresAt: now + ttlSeconds * 1000, nonce: randomBytes(16).toString("hex") });
  const encoded = b64url(canonical(payload));
  const signature = sign(null, Buffer.from(`SkillPass Gateway Authorization v1\n${encoded}`), createPrivateKey(String(privateKeyPem || ""))).toString("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGatewayAssertion({ token, publicKeyPem, now = Date.now() } = {}) {
  const [encoded, signature, extra] = String(token || "").split(".");
  if (!encoded || !signature || extra) throw new Error("gateway assertion is malformed");
  const ok = verify(null, Buffer.from(`SkillPass Gateway Authorization v1\n${encoded}`), createPublicKey(String(publicKeyPem || "")), fromB64url(signature));
  if (!ok) throw Object.assign(new Error("gateway assertion signature is invalid"), { code: "INVALID_GATEWAY_ASSERTION" });
  const payload = JSON.parse(fromB64url(encoded).toString("utf8"));
  if (payload.version !== 1 || !Number.isSafeInteger(payload.expiresAt) || now >= payload.expiresAt) throw Object.assign(new Error("gateway assertion is expired"), { code: "EXPIRED_GATEWAY_ASSERTION" });
  if (!Number.isSafeInteger(payload.issuedAt) || payload.issuedAt > now + 60_000) throw Object.assign(new Error("gateway assertion issuedAt is invalid"), { code: "INVALID_GATEWAY_ASSERTION" });
  return Object.freeze(payload);
}

/**
 * Safe-by-default gateway helper. Remote providers should bind the signed
 * assertion to the concrete provider, service and request body they are about
 * to execute instead of verifying only the Ed25519 signature.
 */
export function verifyGatewayRequest({
  token,
  publicKeyPem,
  expectedProviderId,
  expectedServiceId,
  expectedRequestHash,
  expectedInvocationKey,
  expectedCapabilityId,
  expectedPolicyFingerprint,
  expectedOperationId,
  now = Date.now(),
} = {}) {
  for (const [name, value] of [
    ["expectedProviderId", expectedProviderId],
    ["expectedServiceId", expectedServiceId],
    ["expectedRequestHash", expectedRequestHash],
  ]) {
    if (typeof value !== "string" || !value) throw new Error(`${name} is required`);
  }
  const payload = verifyGatewayAssertion({ token, publicKeyPem, now });
  const expected = {
    providerId: expectedProviderId,
    serviceId: expectedServiceId,
    requestHash: expectedRequestHash,
    ...(expectedInvocationKey !== undefined ? { invocationKey: expectedInvocationKey } : {}),
    ...(expectedCapabilityId !== undefined ? { capabilityId: expectedCapabilityId } : {}),
    ...(expectedPolicyFingerprint !== undefined ? { policyFingerprint: expectedPolicyFingerprint } : {}),
    ...(expectedOperationId !== undefined ? { operationId: expectedOperationId } : {}),
  };
  for (const [claim, value] of Object.entries(expected)) {
    if (canonical(payload[claim]) !== canonical(value)) {
      throw Object.assign(new Error(`gateway assertion ${claim} does not match the request`), {
        code: "GATEWAY_ASSERTION_CLAIM_MISMATCH",
        claim,
      });
    }
  }
  return payload;
}
