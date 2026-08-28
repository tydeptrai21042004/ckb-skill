export const CAPABILITY_VERSION = 1;
export const CAPABILITY_DATA_LENGTH = 106;
export const FLAG_TRANSFERABLE = 1 << 0;
export const FLAG_DELEGATABLE = 1 << 1;
export const FLAG_REVOCABLE = 1 << 2;
export const KNOWN_FLAGS_MASK = FLAG_TRANSFERABLE | FLAG_DELEGATABLE | FLAG_REVOCABLE;
const U64_MAX = (1n << 64n) - 1n;

export class CapabilityCodecError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CapabilityCodecError";
    this.code = code;
  }
}

function assertHex(value, field = "value") {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
    throw new CapabilityCodecError("INVALID_HEX", `${field} must be an even-length 0x-prefixed hex string`);
  }
}

export function hexToBytes(value, expectedLength, field = "value") {
  assertHex(value, field);
  const hex = value.slice(2);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new CapabilityCodecError(
      "INVALID_LENGTH",
      `${field}: expected ${expectedLength} bytes, got ${bytes.length}`,
    );
  }
  return bytes;
}

export function bytesToHex(value) {
  if (!(value instanceof Uint8Array) && !ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer)) {
    throw new CapabilityCodecError("INVALID_BYTES", "value must be Uint8Array-compatible");
  }
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset ?? 0, value.byteLength ?? value.length);
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

export function normalizeHex32(value, field = "value") {
  try {
    return bytesToHex(hexToBytes(value, 32, field));
  } catch (error) {
    if (error instanceof CapabilityCodecError && !error.message.startsWith(`${field}:`)) {
      throw new CapabilityCodecError(error.code, `${field}: ${error.message}`);
    }
    throw error;
  }
}

function normalizeExpiry(expiry) {
  let value;
  try {
    value = typeof expiry === "bigint" ? expiry : BigInt(expiry);
  } catch {
    throw new CapabilityCodecError("INVALID_EXPIRY", "expiry must be an integer-like value");
  }
  if (value < 0n || value > U64_MAX) {
    throw new CapabilityCodecError("INVALID_EXPIRY", "expiry must fit unsigned 64-bit range");
  }
  return value;
}

function validateFlags(flags) {
  if (!Number.isInteger(flags) || flags < 0 || flags > 0xff) {
    throw new CapabilityCodecError("INVALID_FLAGS", "flags must be an unsigned byte");
  }
  if ((flags & ~KNOWN_FLAGS_MASK) !== 0) {
    throw new CapabilityCodecError("UNKNOWN_FLAGS", "unknown flag bits are not accepted in v1");
  }
  return flags;
}

export function normalizeCapability(input) {
  const version = input?.version ?? CAPABILITY_VERSION;
  if (version !== CAPABILITY_VERSION) {
    throw new CapabilityCodecError("UNSUPPORTED_VERSION", `unsupported version ${version}`);
  }
  return Object.freeze({
    version,
    flags: validateFlags(input?.flags ?? 0),
    serviceId: normalizeHex32(input?.serviceId, "serviceId"),
    issuerId: normalizeHex32(input?.issuerId, "issuerId"),
    capabilityId: normalizeHex32(input?.capabilityId, "capabilityId"),
    expiry: normalizeExpiry(input?.expiry),
  });
}

export function encodeCapability(input) {
  const cap = normalizeCapability(input);
  const out = new Uint8Array(CAPABILITY_DATA_LENGTH);
  out[0] = cap.version;
  out[1] = cap.flags;
  out.set(hexToBytes(cap.serviceId, 32, "serviceId"), 2);
  out.set(hexToBytes(cap.issuerId, 32, "issuerId"), 34);
  out.set(hexToBytes(cap.capabilityId, 32, "capabilityId"), 66);
  new DataView(out.buffer, out.byteOffset, out.byteLength).setBigUint64(98, cap.expiry, true);
  return out;
}

export function encodeCapabilityHex(input) {
  return bytesToHex(encodeCapability(input));
}

export function decodeCapability(data) {
  const bytes = typeof data === "string"
    ? hexToBytes(data)
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : data instanceof Uint8Array || ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array();
  if (bytes.length !== CAPABILITY_DATA_LENGTH) {
    throw new CapabilityCodecError(
      "INVALID_LENGTH",
      `expected ${CAPABILITY_DATA_LENGTH} bytes, got ${bytes.length}`,
    );
  }
  if (bytes[0] !== CAPABILITY_VERSION) {
    throw new CapabilityCodecError("UNSUPPORTED_VERSION", `unsupported version ${bytes[0]}`);
  }
  validateFlags(bytes[1]);
  return Object.freeze({
    version: bytes[0],
    flags: bytes[1],
    serviceId: bytesToHex(bytes.subarray(2, 34)),
    issuerId: bytesToHex(bytes.subarray(34, 66)),
    capabilityId: bytesToHex(bytes.subarray(66, 98)),
    expiry: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(98, true),
  });
}

export function encodeTypeArgs({ issuerId, capabilityId }) {
  const issuer = hexToBytes(normalizeHex32(issuerId, "issuerId"), 32, "issuerId");
  const capability = hexToBytes(normalizeHex32(capabilityId, "capabilityId"), 32, "capabilityId");
  const out = new Uint8Array(64);
  out.set(issuer, 0);
  out.set(capability, 32);
  return bytesToHex(out);
}

export function decodeTypeArgs(argsHex) {
  const bytes = hexToBytes(argsHex, 64, "type args");
  return Object.freeze({
    issuerId: bytesToHex(bytes.subarray(0, 32)),
    capabilityId: bytesToHex(bytes.subarray(32, 64)),
  });
}

export function hasFlag(capabilityOrFlags, flag) {
  const flags = typeof capabilityOrFlags === "number" ? capabilityOrFlags : capabilityOrFlags.flags;
  return (flags & flag) === flag;
}

export function isActive(capability, nowUnixSeconds) {
  const now = typeof nowUnixSeconds === "bigint" ? nowUnixSeconds : BigInt(nowUnixSeconds);
  return now < capability.expiry;
}
