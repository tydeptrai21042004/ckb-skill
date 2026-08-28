import { createHash, randomBytes } from "node:crypto";

/** Node-only helper used to generate fixed application identifiers offline. */
export function stableId32(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new TypeError("identifier text must be non-empty");
  }
  return `0x${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

/** Node-only helper for local fixtures; live Capability IDs are Type-ID-derived. */
export function randomId32() {
  return `0x${randomBytes(32).toString("hex")}`;
}
