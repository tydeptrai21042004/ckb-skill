import {
  FLAG_TRANSFERABLE,
  decodeCapability,
  decodeTypeArgs,
  hasFlag,
  normalizeHex32,
} from "../../capability-codec/src/index.mjs";

export class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

function equalHex(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

export function validateIssue({ outputData, typeArgs, transactionInputLockHashes }) {
  const cap = decodeCapability(outputData);
  const args = decodeTypeArgs(typeArgs);

  if (!equalHex(cap.issuerId, args.issuerId)) {
    throw new ProtocolError("ISSUER_ARGS_MISMATCH", "Capability issuer_id must match Type Script args");
  }
  if (!equalHex(cap.capabilityId, args.capabilityId)) {
    throw new ProtocolError("CAPABILITY_ARGS_MISMATCH", "Capability capability_id must match Type Script args");
  }

  const inputHashes = (transactionInputLockHashes ?? []).map((x) => normalizeHex32(x, "inputLockHash"));
  if (!inputHashes.some((x) => equalHex(x, args.issuerId))) {
    throw new ProtocolError("MISSING_ISSUER_AUTH", "issuance requires an input locked by the issuer");
  }
  return cap;
}

export function validateTransition({ inputData, outputData, inputLockHash, outputLockHash, typeArgs }) {
  const before = decodeCapability(inputData);
  const after = decodeCapability(outputData);
  const args = decodeTypeArgs(typeArgs);

  for (const [field, label] of [
    ["version", "version"],
    ["flags", "flags"],
    ["serviceId", "service_id"],
    ["issuerId", "issuer_id"],
    ["capabilityId", "capability_id"],
    ["expiry", "expiry"],
  ]) {
    if (before[field] !== after[field]) {
      throw new ProtocolError("IMMUTABLE_FIELD_CHANGED", `${label} is immutable in MVP transitions`);
    }
  }

  if (!equalHex(before.issuerId, args.issuerId) || !equalHex(before.capabilityId, args.capabilityId)) {
    throw new ProtocolError("ARGS_IDENTITY_MISMATCH", "input CapabilityData does not match Type Script args");
  }

  const inLock = normalizeHex32(inputLockHash, "inputLockHash");
  const outLock = normalizeHex32(outputLockHash, "outputLockHash");
  if (!equalHex(inLock, outLock) && !hasFlag(before, FLAG_TRANSFERABLE)) {
    throw new ProtocolError("TRANSFER_FORBIDDEN", "non-transferable capability cannot change owner lock");
  }
  return after;
}

export function validateGroupShape({ inputCount, outputCount }) {
  if (inputCount === 0 && outputCount === 1) return "ISSUE";
  if (inputCount === 1 && outputCount === 1) return "TRANSITION";
  if (inputCount === 1 && outputCount === 0) {
    throw new ProtocolError("BURN_FORBIDDEN", "capability destruction is not enabled in MVP");
  }
  throw new ProtocolError("INVALID_GROUP_SHAPE", `expected 0->1 or 1->1, got ${inputCount}->${outputCount}`);
}
