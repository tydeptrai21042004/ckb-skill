import {
  FLAG_TRANSFERABLE,
  hasFlag,
  isActive,
  normalizeHex32,
} from "../../capability-codec/src/index.mjs";

export class ServiceRightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ServiceRightError";
    this.code = code;
  }
}

function equalHex(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function normalizeIssuerList(value) {
  const raw = Array.isArray(value) ? value : [value];
  const issuers = raw
    .filter((item) => item !== undefined && item !== null && String(item).trim() !== "")
    .map((item) => normalizeHex32(String(item).trim(), "trustedIssuerId"));
  if (issuers.length === 0) {
    throw new ServiceRightError("TRUST_POLICY_MISSING", "at least one trusted provider issuer is required");
  }
  return Object.freeze([...new Set(issuers.map((item) => item.toLowerCase()))]);
}

/**
 * Normalize the provider-side policy used to interpret a compact Capability v1
 * Cell. Pricing and terms remain service metadata; the Cell only carries the
 * immutable service/issuer/capability identity and expiry.
 */
export function createServicePolicy({
  serviceId,
  trustedIssuerId,
  trustedIssuerIds,
  requireTransferable = true,
  policyId = "",
  termsHash = "",
} = {}) {
  const normalizedTermsHash = termsHash ? normalizeHex32(termsHash, "termsHash") : "";
  return Object.freeze({
    serviceId: normalizeHex32(serviceId, "serviceId"),
    trustedIssuerIds: normalizeIssuerList(trustedIssuerIds ?? trustedIssuerId),
    requireTransferable: Boolean(requireTransferable),
    policyId: String(policyId || "").trim(),
    termsHash: normalizedTermsHash,
  });
}

export function verifyServicePolicy({ capability, policy, nowUnixSeconds }) {
  if (!capability || typeof capability !== "object") {
    throw new ServiceRightError("MALFORMED_CAPABILITY", "capability is required");
  }
  const normalizedPolicy = policy?.trustedIssuerIds ? policy : createServicePolicy(policy);
  if (!equalHex(capability.serviceId, normalizedPolicy.serviceId)) {
    throw new ServiceRightError("WRONG_SERVICE", "capability is for a different service");
  }
  const issuer = normalizeHex32(capability.issuerId, "issuerId").toLowerCase();
  if (!normalizedPolicy.trustedIssuerIds.includes(issuer)) {
    throw new ServiceRightError("UNTRUSTED_ISSUER", "capability was not issued by a trusted service provider");
  }
  if (normalizedPolicy.requireTransferable && !hasFlag(capability, FLAG_TRANSFERABLE)) {
    throw new ServiceRightError("NOT_PORTABLE", "service policy requires a transferable capability");
  }
  if (!isActive(capability, nowUnixSeconds)) {
    throw new ServiceRightError("EXPIRED", "capability is expired");
  }
  return Object.freeze({ capability, policy: normalizedPolicy });
}

/** Return the current owner from a normalized live-cell view. */
export function findCurrentOwner(cell) {
  if (!cell || typeof cell !== "object") {
    throw new ServiceRightError("CELL_NOT_LIVE", "capability cell is missing or already consumed");
  }
  return normalizeHex32(cell.lockHash, "currentOwnerLockHash");
}

/**
 * Verify entitlement only. This intentionally does not inspect payment state.
 */
export function verifyServiceRight({
  cell,
  capability,
  requesterLockHash,
  policy,
  nowUnixSeconds,
}) {
  verifyServicePolicy({ capability, policy, nowUnixSeconds });
  const currentOwnerLockHash = findCurrentOwner(cell);
  const requester = normalizeHex32(requesterLockHash, "requesterLockHash");
  if (!equalHex(currentOwnerLockHash, requester)) {
    throw new ServiceRightError("NOT_OWNER", "requester does not control the current live capability cell");
  }
  return Object.freeze({ capability, currentOwnerLockHash, policy });
}

/**
 * Compose entitlement and per-use payment policy without conflating them.
 * A valid payment can never compensate for a missing/invalid entitlement.
 */
export function authorizeRequest({
  cell,
  capability,
  requesterLockHash,
  policy,
  nowUnixSeconds,
  paymentRequired = false,
  paymentVerified = false,
}) {
  const entitlement = verifyServiceRight({
    cell,
    capability,
    requesterLockHash,
    policy,
    nowUnixSeconds,
  });
  if (paymentRequired && !paymentVerified) {
    throw new ServiceRightError("PAYMENT_REQUIRED", "valid entitlement exists, but per-use payment is still required");
  }
  return Object.freeze({
    authorized: true,
    entitlementVerified: true,
    paymentRequired: Boolean(paymentRequired),
    paymentVerified: Boolean(paymentVerified),
    ...entitlement,
  });
}
