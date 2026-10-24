/**
 * SkillPass Care's fail-closed cross-application boundary.
 *
 * SkillPass resolves current owner from the canonical on-chain live Cell.
 * Care alone owns its quota/state and must commit atomically in its own DB.
 * This bridge does not claim atomicity across CKB and a separate database.
 */
export class CareBridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CareBridgeError";
    this.code = code;
  }
}

function hex32(value, field) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) {
    throw new CareBridgeError("INVALID_REQUEST", `${field} must be 32-byte 0x hex`);
  }
  return value.toLowerCase();
}

function outPoint(value) {
  if (!value || typeof value !== "object") throw new CareBridgeError("INVALID_REQUEST", "outPoint is required");
  const txHash = hex32(value.txHash, "outPoint.txHash");
  if (!Number.isSafeInteger(value.index) || value.index < 0 || value.index > 0xffffffff) {
    throw new CareBridgeError("INVALID_REQUEST", "outPoint.index must be a u32 number");
  }
  return Object.freeze({txHash, index: value.index});
}

function validId(value, field) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value)) {
    throw new CareBridgeError("INVALID_REQUEST", `${field} must be a bounded identifier`);
  }
  return value;
}

function verifyPermit(permit, request) {
  if (!permit || permit.authorized !== true) {
    throw new CareBridgeError("NOT_AUTHORIZED", "canonical SkillPass ownership proof was denied");
  }
  if (hex32(permit.capabilityId, "permit.capabilityId") !== request.capabilityId ||
      hex32(permit.ownerLockHash, "permit.ownerLockHash") !== request.requesterLockHash ||
      hex32(permit.outPoint?.txHash, "permit.outPoint.txHash") !== request.outPoint.txHash ||
      permit.outPoint?.index !== request.outPoint.index) {
    throw new CareBridgeError("STALE_AUTHORIZATION", "authorization is not bound to this capability, owner and outpoint");
  }
  if (!Number.isSafeInteger(permit.confirmations) || permit.confirmations < 1) {
    throw new CareBridgeError("FINALITY_UNVERIFIED", "SkillPass owner proof needs at least one on-chain confirmation");
  }
}

/**
 * verifyRequesterProof must verify a fresh, nonce-bound wallet signature and replay protection.
 * verifyCurrentOwner must resolve the exact CKB outpoint from the caller's independent RPC,
 * not from a cached or Care-owned current-owner field.
 * commitCoverageEvent MUST atomically enforce quota and idempotent operationId in Care's DB.
 */
export function createCareBridge({verifyRequesterProof, verifyCurrentOwner, commitCoverageEvent} = {}) {
  for (const [name, value] of Object.entries({verifyRequesterProof, verifyCurrentOwner, commitCoverageEvent})) {
    if (typeof value !== "function") throw new CareBridgeError("MISSING_ADAPTER", `${name} is required`);
  }
  return Object.freeze({
    async redeem(input = {}) {
      const request = Object.freeze({
        coverageId: validId(input.coverageId, "coverageId"),
        operationId: validId(input.operationId, "operationId"),
        providerId: validId(input.providerId, "providerId"),
        serviceType: validId(input.serviceType, "serviceType"),
        capabilityId: hex32(input.capabilityId, "capabilityId"),
        requesterLockHash: hex32(input.requesterLockHash, "requesterLockHash"),
        outPoint: outPoint(input.outPoint),
        signatureProof: input.signatureProof,
      });
      // A lock hash is public: knowledge of it alone is never an ownership proof.
      const signatureValid = await verifyRequesterProof(request);
      if (signatureValid !== true) throw new CareBridgeError("INVALID_SIGNATURE", "fresh requester signature is required");
      // The second read catches a transfer between initial authorization and the Care commit.
      verifyPermit(await verifyCurrentOwner(request), request);
      verifyPermit(await verifyCurrentOwner(request), request);
      const result = await commitCoverageEvent(Object.freeze({
        coverageId: request.coverageId,
        operationId: request.operationId,
        providerId: request.providerId,
        serviceType: request.serviceType,
        capabilityId: request.capabilityId,
        expectedOwnerLockHash: request.requesterLockHash,
        expectedOutPoint: request.outPoint,
      }));
      if (!result || (result.status !== "committed" && result.status !== "deduplicated")) {
        throw new CareBridgeError("COMMIT_UNVERIFIED", "Care did not confirm a conditional atomic service-event commit");
      }
      return Object.freeze({...result, capabilityId: request.capabilityId, outPoint: request.outPoint});
    },
  });
}
