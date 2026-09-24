import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from "node:crypto";
import { decodeCapability, encodeTypeArgs } from "@skillpass/capability-codec";
import { authorizeRequest, verifyServicePolicy, verifySubjectBinding } from "@skillpass/service-rights";

const MANIFEST_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MANIFEST_MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60_000;
const GATEWAY_MAX_TTL_MS = 300_000;
const RESERVED_GATEWAY_CLAIMS = new Set(["version", "keyId", "issuedAt", "expiresAt", "nonce"]);

const EVIDENCE_ATTESTATION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const EVIDENCE_STORAGE_FIELDS = new Set(["key", "updatedAt", "attestation", "evidenceHash"]);

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function b64url(value) { return Buffer.from(value).toString("base64url"); }
function fromB64url(value) { return Buffer.from(String(value), "base64url"); }
function digestHex(value) { return createHash("sha256").update(value).digest("hex"); }
function signingMaterial(label, payload) { return `${label}\n${canonical(payload)}`; }
function equalText(a, b) { return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase(); }

function verifierError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function parseStrictIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateManifestTimes({ issuedAt, expiresAt, now = Date.now(), allowFuture = true } = {}) {
  const issuedMs = parseStrictIso(issuedAt);
  const expiresMs = parseStrictIso(expiresAt);
  if (issuedMs == null || expiresMs == null) return false;
  if (expiresMs <= issuedMs) return false;
  if (expiresMs - issuedMs > MANIFEST_MAX_LIFETIME_MS) return false;
  if (allowFuture && issuedMs > now + CLOCK_SKEW_MS) return false;
  if (now >= expiresMs) return false;
  return true;
}

function cellType(cell) { return cell?.type ?? cell?.cellOutput?.type ?? null; }

function cellStatus(cell) {
  const raw = cell?.status ?? cell?.cellStatus ?? cell?.liveStatus ?? null;
  return raw == null ? null : String(raw).trim().toLowerCase();
}

function normalizeOptionalHex32(value) {
  if (value == null || value === "") return null;
  const text = String(value).toLowerCase();
  return /^0x[0-9a-f]{64}$/.test(text) ? text : null;
}

function normalizeOptionalOutPoint(value) {
  if (!value || typeof value !== "object") return null;
  const txHash = normalizeOptionalHex32(value.txHash ?? value.tx_hash);
  const indexRaw = value.index ?? value.outputIndex ?? value.output_index;
  if (!txHash || indexRaw == null || indexRaw === "") return null;
  const index = typeof indexRaw === "number" ? indexRaw : Number.parseInt(String(indexRaw), String(indexRaw).startsWith("0x") ? 16 : 10);
  if (!Number.isSafeInteger(index) || index < 0) return null;
  return Object.freeze({ txHash, index });
}

function chainMetadata(cell, confirmations, requiredConfirmations) {
  const blockHash = normalizeOptionalHex32(cell?.blockHash ?? cell?.block_hash);
  const blockNumberRaw = cell?.blockNumber ?? cell?.block_number ?? null;
  let blockNumber = null;
  if (blockNumberRaw !== null && blockNumberRaw !== undefined && blockNumberRaw !== "") {
    try { blockNumber = BigInt(blockNumberRaw).toString(); } catch { blockNumber = null; }
  }
  return Object.freeze({
    outPoint: normalizeOptionalOutPoint(cell?.outPoint ?? cell?.out_point),
    blockNumber,
    blockHash,
    confirmations,
    requiredConfirmations,
  });
}

function cellLockHash(cell) {
  if (cell?.lockHash) return String(cell.lockHash);
  const lock = cell?.cellOutput?.lock;
  if (lock && typeof lock.hash === "function") return String(lock.hash());
  if (cell?.cellOutput?.lockHash) return String(cell.cellOutput.lockHash);
  return "";
}

function capabilityEquivalent(a, b) {
  if (!a || !b) return false;
  for (const key of ["version", "flags"]) if (Number(a[key]) !== Number(b[key])) return false;
  for (const key of ["serviceId", "issuerId", "capabilityId"]) if (!equalText(a[key], b[key])) return false;
  try { if (BigInt(a.expiry) !== BigInt(b.expiry)) return false; } catch { return false; }
  if (Number(a.version) === 2 || Number(b.version) === 2) {
    for (const key of ["subjectType", "bindingMode"]) if (Number(a[key]) !== Number(b[key])) return false;
    for (const key of ["subjectId", "policyHash"]) if (!equalText(a[key], b[key])) return false;
  }
  return true;
}

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

function authorizationEvidencePayload(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new Error("authorization evidence is required");
  const payload = { ...evidence };
  for (const field of EVIDENCE_STORAGE_FIELDS) delete payload[field];
  return payload;
}

/** Stable SHA-256 digest for a persisted authorization evidence record. */
export function hashAuthorizationEvidence(evidence) {
  return digestHex(canonical(authorizationEvidencePayload(evidence)));
}

/**
 * Sign one authorization evidence record so it can be exported and verified
 * outside the SkillPass server. Storage metadata is deliberately excluded.
 */
export function signAuthorizationEvidence({ evidence, privateKeyPem, keyId = "provider-evidence", issuedAt = new Date().toISOString() } = {}) {
  const normalizedKeyId = String(keyId || "").trim();
  if (!normalizedKeyId) throw new Error("keyId is required");
  const issuedMs = parseStrictIso(String(issuedAt));
  if (issuedMs == null) throw new Error("issuedAt must be an ISO-8601 UTC timestamp");
  const payload = authorizationEvidencePayload(evidence);
  const evidenceHash = hashAuthorizationEvidence(payload);
  const requestId = String(payload.requestId || "").trim();
  if (!requestId) throw new Error("authorization evidence requestId is required");
  const privateKey = createPrivateKey(String(privateKeyPem || ""));
  const envelope = Object.freeze({
    version: 1,
    keyId: normalizedKeyId,
    algorithm: "Ed25519",
    requestId,
    evidenceHash: `sha256:${evidenceHash}`,
    issuedAt: String(issuedAt),
  });
  const value = sign(null, Buffer.from(signingMaterial("SkillPass Authorization Evidence v1", envelope)), privateKey).toString("base64url");
  const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  return Object.freeze({ ...payload, evidenceHash, attestation: Object.freeze({ ...envelope, value, publicKeyPem }) });
}

/** Verify both evidence integrity and its Ed25519 provider attestation. */
export function verifyAuthorizationEvidence({ evidence, publicKeyPem = "", trustedFingerprint = "", now = Date.now() } = {}) {
  if (!evidence || typeof evidence !== "object") return false;
  const attestation = evidence.attestation;
  if (!attestation || attestation.version !== 1 || attestation.algorithm !== "Ed25519" || !attestation.value) return false;
  const issuedMs = parseStrictIso(String(attestation.issuedAt || ""));
  if (issuedMs == null || issuedMs > now + CLOCK_SKEW_MS || now - issuedMs > EVIDENCE_ATTESTATION_MAX_AGE_MS) return false;
  const computed = hashAuthorizationEvidence(evidence);
  const storedHash = String(evidence.evidenceHash || "").replace(/^sha256:/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(storedHash) || storedHash !== computed) return false;
  if (String(attestation.evidenceHash || "").toLowerCase() !== `sha256:${computed}`) return false;
  if (String(attestation.requestId || "") !== String(evidence.requestId || "")) return false;
  const embedded = String(attestation.publicKeyPem || "");
  const key = String(publicKeyPem || embedded);
  if (!key) return false;
  if (trustedFingerprint && publicKeyFingerprint(key) !== String(trustedFingerprint).toLowerCase()) return false;
  if (publicKeyPem && embedded && publicKeyFingerprint(embedded) !== publicKeyFingerprint(publicKeyPem)) return false;
  const envelope = {
    version: 1, keyId: String(attestation.keyId || ""), algorithm: "Ed25519",
    requestId: String(attestation.requestId || ""), evidenceHash: String(attestation.evidenceHash || ""),
    issuedAt: String(attestation.issuedAt || ""),
  };
  if (!envelope.keyId) return false;
  try {
    return verify(null, Buffer.from(signingMaterial("SkillPass Authorization Evidence v1", envelope)), createPublicKey(key), fromB64url(attestation.value));
  } catch {
    return false;
  }
}

/**
 * Validate a provider-resolved live Capability Cell before authorization.
 * This helper deliberately checks the accepted Type Script deployment and
 * data/Type-args identity so an integrator cannot accidentally authorize a
 * look-alike Cell from another deployment.
 */
export function verifyResolvedCapabilityCell({ cell, capability, deployment, minConfirmations = 1 } = {}) {
  if (!cell || typeof cell !== "object") throw verifierError("CELL_NOT_LIVE", "capability cell is missing or already consumed");
  const status = cellStatus(cell);
  if (status && status !== "live") {
    throw verifierError("CELL_NOT_LIVE", `capability cell status is ${status}, not live`, { cellStatus: status });
  }
  if (!deployment || typeof deployment !== "object" || !deployment.codeHash || !deployment.hashType) {
    throw new Error("deployment.codeHash and deployment.hashType are required");
  }
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 0 || minConfirmations > 10_000) {
    throw new Error("minConfirmations must be an integer in 0..10000");
  }

  const type = cellType(cell);
  if (!type || !equalText(type.codeHash, deployment.codeHash) || String(type.hashType) !== String(deployment.hashType)) {
    throw verifierError("WRONG_DEPLOYMENT", "cell is not from the accepted SkillPass Capability Type Script deployment");
  }
  if (cell.outputData == null) throw verifierError("MALFORMED_CAPABILITY", "resolved live cell must include outputData");

  let decoded;
  try { decoded = decodeCapability(cell.outputData); }
  catch (cause) { throw verifierError("MALFORMED_CAPABILITY", "resolved live cell contains invalid Capability data", { cause }); }
  if (capability && !capabilityEquivalent(decoded, capability)) {
    throw verifierError("CAPABILITY_DATA_MISMATCH", "resolved live Cell data does not match the requested Capability");
  }
  if (!equalText(type.args, encodeTypeArgs(decoded))) {
    throw verifierError("IDENTITY_MISMATCH", "Capability Type args do not match issuer/capability identity in Cell data");
  }

  const lockHash = cellLockHash(cell);
  if (!/^0x[0-9a-fA-F]{64}$/.test(lockHash)) {
    throw verifierError("MALFORMED_OWNER", "resolved live cell must expose a 32-byte owner lock hash");
  }

  let confirmations = null;
  if (cell.confirmations !== undefined && cell.confirmations !== null && cell.confirmations !== "") {
    const n = Number(cell.confirmations);
    if (!Number.isSafeInteger(n) || n < 0) throw verifierError("FINALITY_METADATA_INVALID", "resolved confirmations must be a non-negative safe integer");
    confirmations = n;
  }
  if (minConfirmations > 0) {
    if (confirmations == null) throw verifierError("FINALITY_METADATA_UNAVAILABLE", "provider resolver must supply confirmations for finality enforcement");
    if (confirmations < minConfirmations) {
      throw verifierError("CAPABILITY_NOT_FINAL", "capability has not reached the provider confirmation threshold", { confirmations, requiredConfirmations: minConfirmations });
    }
  }

  const chain = chainMetadata(cell, confirmations, minConfirmations);
  return Object.freeze({
    cell,
    capability: decoded,
    lockHash: lockHash.toLowerCase(),
    confirmations,
    requiredConfirmations: minConfirmations,
    chain,
  });
}

/**
 * Safe high-level provider verifier. The provider still owns its CKB RPC,
 * policy, issuer trust and subject resolver, while the SDK enforces deployment,
 * Cell identity and confirmation checks before owner authorization.
 */
export async function verifySkillPassAuthorization({
  capability,
  policy,
  requesterLockHash,
  deployment,
  minConfirmations = 1,
  resolveLiveCell,
  resolveSubject = null,
  nowUnixSeconds = BigInt(Math.floor(Date.now() / 1000)),
  paymentRequired = false,
  paymentVerified = false,
} = {}) {
  if (typeof resolveLiveCell !== "function") throw new Error("resolveLiveCell is required");
  const resolved = verifyResolvedCapabilityCell({
    cell: await resolveLiveCell(capability),
    capability,
    deployment,
    minConfirmations,
  });
  verifyServicePolicy({ capability: resolved.capability, policy, nowUnixSeconds });
  let subject = null;
  if (resolved.capability?.version === 2 && resolved.capability.bindingMode !== 0) {
    if (typeof resolveSubject !== "function") {
      throw verifierError("SUBJECT_RESOLVER_UNAVAILABLE", "subject-bound capability requires a provider subject resolver");
    }
    subject = await resolveSubject(resolved.capability);
    verifySubjectBinding({ capability: resolved.capability, capabilityOwnerLockHash: resolved.lockHash, subject });
  }
  const decision = authorizeRequest({
    cell: { lockHash: resolved.lockHash },
    capability: resolved.capability,
    requesterLockHash,
    policy,
    nowUnixSeconds,
    paymentRequired,
    paymentVerified,
    subject,
  });
  return Object.freeze({ ...decision, confirmations: resolved.confirmations, requiredConfirmations: resolved.requiredConfirmations, chain: resolved.chain });
}

/**
 * Low-level verifier kept for compatibility. Prefer verifySkillPassAuthorization
 * for external providers because it validates the accepted Type Script and
 * confirmation threshold before applying service policy/ownership checks.
 */
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
      throw verifierError("SUBJECT_RESOLVER_UNAVAILABLE", "subject-bound capability requires a provider subject resolver");
    }
    subject = await resolveSubject(capability);
    verifySubjectBinding({ capability, capabilityOwnerLockHash: cell.lockHash, subject });
  }
  return authorizeRequest({ cell, capability, requesterLockHash, policy, nowUnixSeconds, paymentRequired, paymentVerified, subject });
}

export function signProviderManifest({ manifest, privateKeyPem, keyId = "provider-default", issuedAt = new Date().toISOString(), expiresAt = "" } = {}) {
  if (!manifest || typeof manifest !== "object") throw new Error("manifest is required");
  if (!String(keyId || "").trim()) throw new Error("keyId is required");
  const issuedMs = parseStrictIso(String(issuedAt));
  if (issuedMs == null) throw new Error("issuedAt must be an ISO-8601 UTC timestamp");
  const normalizedExpiresAt = expiresAt ? String(expiresAt) : new Date(issuedMs + MANIFEST_DEFAULT_TTL_MS).toISOString();
  if (!validateManifestTimes({ issuedAt: String(issuedAt), expiresAt: normalizedExpiresAt, now: issuedMs, allowFuture: false })) {
    throw new Error("expiresAt must be after issuedAt and within 7 days");
  }
  const privateKey = createPrivateKey(String(privateKeyPem || ""));
  const unsigned = { ...manifest };
  delete unsigned.signature;
  delete unsigned.manifestHash;
  const manifestHash = digestHex(canonical(unsigned));
  const envelope = {
    version: 1,
    keyId: String(keyId),
    algorithm: "Ed25519",
    manifestHash: `sha256:${manifestHash}`,
    issuedAt: String(issuedAt),
    expiresAt: normalizedExpiresAt,
  };
  const signature = sign(null, Buffer.from(signingMaterial("SkillPass Provider Manifest v1", envelope)), privateKey).toString("base64url");
  const publicKeyPem = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
  return Object.freeze({ ...unsigned, manifestHash: envelope.manifestHash, signature: Object.freeze({ ...envelope, value: signature, publicKeyPem }) });
}

/** Signature/tamper verification only. For trust decisions use verifyTrustedProviderManifest(). */
export function verifyProviderManifest({ signedManifest, publicKeyPem, now = Date.now() } = {}) {
  const signature = signedManifest?.signature;
  if (!signature || signature.version !== 1 || signature.algorithm !== "Ed25519" || !signature.value || !String(signature.keyId || "").trim()) return false;
  if (!validateManifestTimes({ issuedAt: signature.issuedAt, expiresAt: signature.expiresAt, now })) return false;
  const unsigned = { ...signedManifest };
  delete unsigned.signature;
  delete unsigned.manifestHash;
  const expectedHash = `sha256:${digestHex(canonical(unsigned))}`;
  if (expectedHash !== signature.manifestHash || expectedHash !== signedManifest.manifestHash) return false;
  const envelope = {
    version: signature.version,
    keyId: signature.keyId,
    algorithm: signature.algorithm,
    manifestHash: signature.manifestHash,
    issuedAt: signature.issuedAt,
    expiresAt: signature.expiresAt,
  };
  try {
    return verify(null, Buffer.from(signingMaterial("SkillPass Provider Manifest v1", envelope)), createPublicKey(publicKeyPem || signature.publicKeyPem), fromB64url(signature.value));
  } catch {
    return false;
  }
}

/** Verify a provider manifest against an independently trusted key/fingerprint. */
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
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error("claims are required");
  for (const key of RESERVED_GATEWAY_CLAIMS) {
    if (Object.prototype.hasOwnProperty.call(claims, key)) throw new Error(`claims.${key} is reserved by the gateway assertion envelope`);
  }
  if (!String(keyId || "").trim()) throw new Error("keyId is required");
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) throw new Error("ttlSeconds must be 1..300");
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("now must be a non-negative millisecond timestamp");
  const payload = Object.freeze({ ...claims, version: 1, keyId: String(keyId), issuedAt: now, expiresAt: now + ttlSeconds * 1000, nonce: randomBytes(16).toString("hex") });
  const encoded = b64url(canonical(payload));
  const signature = sign(null, Buffer.from(`SkillPass Gateway Authorization v1\n${encoded}`), createPrivateKey(String(privateKeyPem || ""))).toString("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGatewayAssertion({ token, publicKeyPem, now = Date.now() } = {}) {
  const [encoded, signature, extra] = String(token || "").split(".");
  if (!encoded || !signature || extra) throw new Error("gateway assertion is malformed");
  const ok = verify(null, Buffer.from(`SkillPass Gateway Authorization v1\n${encoded}`), createPublicKey(String(publicKeyPem || "")), fromB64url(signature));
  if (!ok) throw verifierError("INVALID_GATEWAY_ASSERTION", "gateway assertion signature is invalid");
  let payload;
  try { payload = JSON.parse(fromB64url(encoded).toString("utf8")); }
  catch { throw verifierError("INVALID_GATEWAY_ASSERTION", "gateway assertion payload is invalid"); }
  if (!payload || payload.version !== 1 || !String(payload.keyId || "").trim() || !/^[0-9a-f]{32}$/i.test(String(payload.nonce || ""))) {
    throw verifierError("INVALID_GATEWAY_ASSERTION", "gateway assertion envelope is invalid");
  }
  if (!Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt) || payload.issuedAt < 0 || payload.expiresAt <= payload.issuedAt || payload.expiresAt - payload.issuedAt > GATEWAY_MAX_TTL_MS) {
    throw verifierError("INVALID_GATEWAY_ASSERTION", "gateway assertion lifetime is invalid");
  }
  if (payload.issuedAt > now + CLOCK_SKEW_MS) throw verifierError("INVALID_GATEWAY_ASSERTION", "gateway assertion issuedAt is invalid");
  if (now >= payload.expiresAt) throw verifierError("EXPIRED_GATEWAY_ASSERTION", "gateway assertion is expired");
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
      throw verifierError("GATEWAY_ASSERTION_CLAIM_MISMATCH", `gateway assertion ${claim} does not match the request`, { claim });
    }
  }
  return payload;
}
