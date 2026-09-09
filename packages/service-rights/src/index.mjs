import {
  FLAG_DELEGATABLE,
  FLAG_REVOCABLE,
  FLAG_TRANSFERABLE,
  hasFlag,
  isActive,
  normalizeHex32,
  BINDING_HOLDER,
  BINDING_SUBJECT_OWNER,
  BINDING_ATOMIC,
  BINDING_LICENSE,
  SUBJECT_NONE,
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


function normalizeSubjectTypes(value) {
  if (value == null) return Object.freeze([]);
  const raw = Array.isArray(value) ? value : [value];
  const out = raw.map((item) => Number(item));
  if (out.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    throw new ServiceRightError("INVALID_SUBJECT_POLICY", "acceptedSubjectTypes must contain unsigned bytes");
  }
  return Object.freeze([...new Set(out)]);
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
  requireSubjectBinding = false,
  acceptedSubjectTypes = [],
  requiredPolicyHash = "",
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
  const normalizedRequiredPolicyHash = requiredPolicyHash ? normalizeHex32(requiredPolicyHash, "requiredPolicyHash") : "";
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
    requireSubjectBinding: Boolean(requireSubjectBinding),
    acceptedSubjectTypes: normalizeSubjectTypes(acceptedSubjectTypes),
    requiredPolicyHash: normalizedRequiredPolicyHash ? normalizedRequiredPolicyHash.toLowerCase() : "",
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
  const isV2 = capability.version === 2;
  if (normalizedPolicy.requireSubjectBinding && (!isV2 || capability.subjectType === SUBJECT_NONE || capability.bindingMode === BINDING_HOLDER)) {
    throw new ServiceRightError("SUBJECT_BINDING_REQUIRED", "service policy requires a subject-bound Capability v2");
  }
  if (isV2 && normalizedPolicy.acceptedSubjectTypes.length && !normalizedPolicy.acceptedSubjectTypes.includes(capability.subjectType)) {
    throw new ServiceRightError("SUBJECT_TYPE_NOT_ACCEPTED", "capability subject type is not accepted by this provider");
  }
  if (normalizedPolicy.requiredPolicyHash) {
    if (!isV2 || !equalHex(capability.policyHash, normalizedPolicy.requiredPolicyHash)) {
      throw new ServiceRightError("POLICY_COMMITMENT_MISMATCH", "capability policy commitment does not match provider policy");
    }
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


/** Verify that a v2 subject-bound right is still owned by the same principal. */
export function verifySubjectBinding({ capability, capabilityOwnerLockHash, subject }) {
  if (capability?.version !== 2 || capability.bindingMode === BINDING_HOLDER) {
    return Object.freeze({ bound: false, subject: null });
  }
  if (!subject || subject.live === false) {
    throw new ServiceRightError("SUBJECT_NOT_LIVE", "bound subject is missing or already consumed");
  }
  const subjectId = normalizeHex32(subject.id, "subject.id");
  if (!equalHex(subjectId, capability.subjectId)) {
    throw new ServiceRightError("SUBJECT_ID_MISMATCH", "resolved subject does not match capability subject commitment");
  }
  const subjectOwner = normalizeHex32(subject.lockHash, "subject.lockHash");
  const capabilityOwner = normalizeHex32(capabilityOwnerLockHash, "capabilityOwnerLockHash");
  if (!equalHex(subjectOwner, capabilityOwner)) {
    throw new ServiceRightError("SUBJECT_OWNER_MISMATCH", "service right and bound subject no longer have the same owner");
  }
  return Object.freeze({ bound: true, subject: Object.freeze({ id: subjectId, lockHash: subjectOwner }), bindingMode: capability.bindingMode });
}

/** Normalize an independently signed/managed provider acceptance manifest. Signature verification is intentionally adapter-specific. */
export function createProviderAcceptance({ providerId, bundleId = "", serviceIds, entitlementIds, trustedIssuerIds, subjectTypes = [], policyHash = "", validUntil = 0 } = {}) {
  const normalizedProviderId = normalizeHex32(providerId, "providerId").toLowerCase();
  const services = normalizeHex32List(serviceIds, "serviceId");
  const entitlements = normalizeHex32List(entitlementIds, "entitlementId");
  const issuers = normalizeIssuerList(trustedIssuerIds);
  if (!services.length || !entitlements.length) throw new ServiceRightError("INVALID_ACCEPTANCE", "provider acceptance requires service and entitlement ids");
  const expiry = Number(validUntil || 0);
  if (!Number.isSafeInteger(expiry) || expiry < 0) throw new ServiceRightError("INVALID_ACCEPTANCE", "validUntil must be a non-negative unix timestamp");
  return Object.freeze({ providerId: normalizedProviderId, bundleId: String(bundleId || "").trim(), serviceIds: services, entitlementIds: entitlements, trustedIssuerIds: issuers, subjectTypes: normalizeSubjectTypes(subjectTypes), policyHash: policyHash ? normalizeHex32(policyHash, "policyHash").toLowerCase() : "", validUntil: expiry });
}

export function acceptanceAllowsCapability({ acceptance, capability, serviceId, nowUnixSeconds = 0 }) {
  const a = acceptance?.providerId ? acceptance : createProviderAcceptance(acceptance);
  const sid = normalizeHex32(serviceId, "serviceId").toLowerCase();
  if (!a.serviceIds.includes(sid)) return false;
  if (!a.entitlementIds.includes(normalizeHex32(capability.serviceId, "capability.serviceId").toLowerCase())) return false;
  if (!a.trustedIssuerIds.includes(normalizeHex32(capability.issuerId, "capability.issuerId").toLowerCase())) return false;
  if (a.validUntil && Number(nowUnixSeconds) >= a.validUntil) return false;
  if (a.subjectTypes.length && (capability.version !== 2 || !a.subjectTypes.includes(capability.subjectType))) return false;
  if (a.policyHash && (capability.version !== 2 || !equalHex(a.policyHash, capability.policyHash))) return false;
  return true;
}

/** Stable authorization evidence for audit/debugging. The caller supplies requestHash/paymentProofHash to avoid leaking payloads. */
export function createAuthorizationEvidence({ requestHash, capability, outPoint, providerId = "", serviceId, policyHash = "", delegationId = "", paymentProofHash = "", decision = "allow", timestamp = new Date().toISOString(), subject = null } = {}) {
  const normalizedDecision = String(decision).toLowerCase();
  if (!["allow", "deny"].includes(normalizedDecision)) throw new ServiceRightError("INVALID_EVIDENCE", "decision must be allow or deny");
  return Object.freeze({
    version: 1,
    requestHash: normalizeHex32(requestHash, "requestHash").toLowerCase(),
    capabilityId: normalizeHex32(capability?.capabilityId, "capabilityId").toLowerCase(),
    capabilityOutPoint: Object.freeze({ txHash: normalizeHex32(outPoint?.txHash, "outPoint.txHash").toLowerCase(), index: String(outPoint?.index ?? "") }),
    providerId: providerId ? normalizeHex32(providerId, "providerId").toLowerCase() : "",
    serviceId: normalizeHex32(serviceId, "serviceId").toLowerCase(),
    policyHash: policyHash ? normalizeHex32(policyHash, "policyHash").toLowerCase() : "",
    subjectId: capability?.version === 2 && capability.subjectType !== SUBJECT_NONE ? capability.subjectId.toLowerCase() : "",
    subjectOwnerLockHash: subject?.lockHash ? normalizeHex32(subject.lockHash, "subject.lockHash").toLowerCase() : "",
    delegationId: String(delegationId || ""),
    paymentProofHash: paymentProofHash ? normalizeHex32(paymentProofHash, "paymentProofHash").toLowerCase() : "",
    decision: normalizedDecision,
    timestamp: String(timestamp),
  });
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
  subject = null,
}) {
  const entitlement = verifyServiceRight({
    cell,
    capability,
    requesterLockHash,
    policy,
    nowUnixSeconds,
  });
  const subjectBinding = verifySubjectBinding({ capability, capabilityOwnerLockHash: entitlement.currentOwnerLockHash, subject });
  if (paymentRequired && !paymentVerified) {
    throw new ServiceRightError("PAYMENT_REQUIRED", "valid entitlement exists, but per-use payment is still required");
  }
  return Object.freeze({
    authorized: true,
    entitlementVerified: true,
    paymentRequired: Boolean(paymentRequired),
    paymentVerified: Boolean(paymentVerified),
    subjectBinding,
    ...entitlement,
  });
}
