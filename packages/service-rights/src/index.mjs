import {
  FLAG_DELEGATABLE,
  FLAG_REVOCABLE,
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

function normalizeHex32List(value, field) {
  const raw = Array.isArray(value) ? value : [value];
  const normalized = raw
    .filter((item) => item !== undefined && item !== null && String(item).trim() !== "")
    .map((item) => normalizeHex32(String(item).trim(), field).toLowerCase());
  return Object.freeze([...new Set(normalized)]);
}

function normalizeIssuerList(value) {
  const issuers = normalizeHex32List(value, "trustedIssuerId");
  if (issuers.length === 0) {
    throw new ServiceRightError("TRUST_POLICY_MISSING", "at least one trusted provider issuer is required");
  }
  return issuers;
}

function normalizeEntitlementIds(serviceId, value) {
  const ids = normalizeHex32List(value?.length ? value : [serviceId], "entitlementId");
  if (ids.length === 0) {
    throw new ServiceRightError("ENTITLEMENT_POLICY_MISSING", "at least one entitlement service id is required");
  }
  return ids;
}

function normalizeRightMode(value) {
  const mode = String(value || "owned").trim().toLowerCase();
  if (!["owned", "license"].includes(mode)) {
    throw new ServiceRightError("INVALID_RIGHT_MODE", "rightMode must be owned or license");
  }
  return mode;
}

/**
 * Normalize the provider-side policy used to interpret a compact Capability v1
 * Cell. The endpoint service id is separate from the accepted entitlement ids:
 * multiple independent services may opt in to the same bundle entitlement id.
 */
export function createServicePolicy({
  serviceId,
  entitlementIds,
  issuanceEntitlementId,
  bundleId = "",
  trustedIssuerId,
  trustedIssuerIds,
  requireTransferable = true,
  delegationAllowed = true,
  requireDelegatable = false,
  rightMode = "owned",
  policyId = "",
  termsHash = "",
} = {}) {
  const normalizedServiceId = normalizeHex32(serviceId, "serviceId");
  const normalizedEntitlementIds = normalizeEntitlementIds(normalizedServiceId, entitlementIds);
  const normalizedIssuanceEntitlementId = normalizeHex32(
    issuanceEntitlementId || normalizedEntitlementIds[0],
    "issuanceEntitlementId",
  ).toLowerCase();
  if (!normalizedEntitlementIds.includes(normalizedIssuanceEntitlementId)) {
    throw new ServiceRightError(
      "INVALID_ISSUANCE_ENTITLEMENT",
      "issuanceEntitlementId must be present in entitlementIds",
    );
  }
  const mode = normalizeRightMode(rightMode);
  const delegation = Boolean(delegationAllowed);
  const requiredDelegatable = Boolean(requireDelegatable);
  if (requiredDelegatable && !delegation) {
    throw new ServiceRightError(
      "INVALID_DELEGATION_POLICY",
      "requireDelegatable cannot be true when delegationAllowed is false",
    );
  }
  const normalizedTermsHash = termsHash ? normalizeHex32(termsHash, "termsHash") : "";
  const normalizedBundleId = String(bundleId || "").trim();
  if (normalizedBundleId.length > 128) {
    throw new ServiceRightError("INVALID_BUNDLE_ID", "bundleId must be at most 128 characters");
  }

  return Object.freeze({
    serviceId: normalizedServiceId.toLowerCase(),
    entitlementIds: normalizedEntitlementIds,
    issuanceEntitlementId: normalizedIssuanceEntitlementId,
    bundleId: normalizedBundleId,
    trustedIssuerIds: normalizeIssuerList(trustedIssuerIds ?? trustedIssuerId),
    requireTransferable: Boolean(requireTransferable),
    delegationAllowed: delegation,
    requireDelegatable: requiredDelegatable,
    rightMode: mode,
    policyId: String(policyId || "").trim(),
    termsHash: normalizedTermsHash ? normalizedTermsHash.toLowerCase() : "",
  });
}

/** Return true when a Capability's immutable service id can satisfy this service. */
export function policyAcceptsEntitlement(policy, capabilityServiceId) {
  const normalizedPolicy = policy?.entitlementIds ? policy : createServicePolicy(policy);
  const candidate = normalizeHex32(capabilityServiceId, "capability.serviceId").toLowerCase();
  return normalizedPolicy.entitlementIds.includes(candidate);
}

export function verifyServicePolicy({ capability, policy, nowUnixSeconds }) {
  if (!capability || typeof capability !== "object") {
    throw new ServiceRightError("MALFORMED_CAPABILITY", "capability is required");
  }
  const normalizedPolicy = policy?.trustedIssuerIds ? policy : createServicePolicy(policy);
  if (!policyAcceptsEntitlement(normalizedPolicy, capability.serviceId)) {
    throw new ServiceRightError("WRONG_SERVICE", "capability belongs to a different service or is not an accepted entitlement for this service");
  }
  const issuer = normalizeHex32(capability.issuerId, "issuerId").toLowerCase();
  if (!normalizedPolicy.trustedIssuerIds.includes(issuer)) {
    throw new ServiceRightError("UNTRUSTED_ISSUER", "capability was not issued by a trusted service provider");
  }
  if (normalizedPolicy.requireTransferable && !hasFlag(capability, FLAG_TRANSFERABLE)) {
    throw new ServiceRightError("NOT_PORTABLE", "service policy requires a transferable capability");
  }
  if (normalizedPolicy.requireDelegatable && !hasFlag(capability, FLAG_DELEGATABLE)) {
    throw new ServiceRightError("NOT_DELEGATABLE", "service policy requires an agent-delegatable capability");
  }
  if (normalizedPolicy.rightMode === "license" && !hasFlag(capability, FLAG_REVOCABLE)) {
    throw new ServiceRightError("NOT_REVOCABLE", "license policy requires a provider-revocable capability");
  }
  if (!isActive(capability, nowUnixSeconds)) {
    throw new ServiceRightError("EXPIRED", "capability is expired");
  }
  return Object.freeze({ capability, policy: normalizedPolicy });
}

/** Verify whether owner-signed agent delegation is permitted for this Capability. */
export function verifyDelegationPolicy({ capability, policy }) {
  const normalizedPolicy = policy?.trustedIssuerIds ? policy : createServicePolicy(policy);
  if (!normalizedPolicy.delegationAllowed) {
    throw new ServiceRightError("DELEGATION_DISABLED", "provider policy does not allow agent delegation for this service");
  }
  if (!hasFlag(capability, FLAG_DELEGATABLE)) {
    throw new ServiceRightError("NOT_DELEGATABLE", "capability does not permit agent delegation");
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

/** Verify entitlement only. This intentionally does not inspect payment state. */
export function verifyServiceRight({
  cell,
  capability,
  requesterLockHash,
  policy,
  nowUnixSeconds,
}) {
  const checked = verifyServicePolicy({ capability, policy, nowUnixSeconds });
  const currentOwnerLockHash = findCurrentOwner(cell);
  const requester = normalizeHex32(requesterLockHash, "requesterLockHash");
  if (!equalHex(currentOwnerLockHash, requester)) {
    throw new ServiceRightError("NOT_OWNER", "requester does not control the current live capability cell");
  }
  return Object.freeze({ capability, currentOwnerLockHash, policy: checked.policy });
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
