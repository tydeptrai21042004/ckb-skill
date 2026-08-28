import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY_DATA_LENGTH,
  CAPABILITY_VERSION,
  FLAG_DELEGATABLE,
  FLAG_REVOCABLE,
  FLAG_TRANSFERABLE,
  decodeCapability,
  decodeTypeArgs,
  encodeCapability,
  encodeCapabilityHex,
  encodeTypeArgs,
  isActive,
} from "../src/index.mjs";
import { stableId32 } from "../src/node-ids.mjs";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "../src/service-ids.mjs";

const Z = `0x${"00".repeat(32)}`;
const O = `0x${"11".repeat(32)}`;
const T = `0x${"22".repeat(32)}`;

function cap(overrides = {}) {
  return {
    version: CAPABILITY_VERSION,
    flags: FLAG_TRANSFERABLE,
    serviceId: Z,
    issuerId: O,
    capabilityId: T,
    expiry: 1_900_000_000n,
    ...overrides,
  };
}

test("codec roundtrip preserves all fields", () => {
  const encoded = encodeCapability(cap({ flags: FLAG_TRANSFERABLE | FLAG_DELEGATABLE | FLAG_REVOCABLE }));
  assert.equal(encoded.length, CAPABILITY_DATA_LENGTH);
  assert.deepEqual(decodeCapability(encoded), cap({ flags: 7 }));
});

test("hex codec roundtrip", () => {
  const encoded = encodeCapabilityHex(cap());
  assert.equal(encoded.length, 2 + CAPABILITY_DATA_LENGTH * 2);
  assert.deepEqual(decodeCapability(encoded), cap());
});

test("expiry boundaries: before active, at expiry inactive", () => {
  const decoded = decodeCapability(encodeCapability(cap({ expiry: 100n })));
  assert.equal(isActive(decoded, 99n), true);
  assert.equal(isActive(decoded, 100n), false);
  assert.equal(isActive(decoded, 101n), false);
});

test("expiry supports u64 minimum and maximum", () => {
  const max = (1n << 64n) - 1n;
  assert.equal(decodeCapability(encodeCapability(cap({ expiry: 0n }))).expiry, 0n);
  assert.equal(decodeCapability(encodeCapability(cap({ expiry: max }))).expiry, max);
});

test("invalid payload length is rejected", () => {
  assert.throws(() => decodeCapability(Buffer.alloc(105)), /expected 106 bytes/);
  assert.throws(() => decodeCapability(Buffer.alloc(107)), /expected 106 bytes/);
});

test("unknown version is rejected", () => {
  const raw = encodeCapability(cap());
  raw[0] = 2;
  assert.throws(() => decodeCapability(raw), /unsupported version/);
});

test("unknown flag bit is rejected", () => {
  assert.throws(() => encodeCapability(cap({ flags: 0b1000 })), /unknown flag bits/);
});

test("invalid 32-byte identifiers are rejected", () => {
  assert.throws(() => encodeCapability(cap({ serviceId: "0x12" })), /expected 32 bytes/);
});

test("type args encode issuer and capability identity", () => {
  const args = encodeTypeArgs({ issuerId: O, capabilityId: T });
  assert.equal(args.length, 2 + 64 * 2);
  assert.deepEqual(decodeTypeArgs(args), { issuerId: O, capabilityId: T });
});

test("stableId32 is deterministic and 32 bytes", () => {
  const a = stableId32("paper-analyzer-v1");
  const b = stableId32("paper-analyzer-v1");
  assert.equal(a, b);
  assert.match(a, /^0x[0-9a-f]{64}$/);
});

test("shared codec works without Node Buffer global", () => {
  const original = globalThis.Buffer;
  try {
    globalThis.Buffer = undefined;
    const encoded = encodeCapability(cap({ expiry: 123n }));
    assert.equal(encoded instanceof Uint8Array, true);
    assert.equal(decodeCapability(encoded).expiry, 123n);
  } finally {
    globalThis.Buffer = original;
  }
});
