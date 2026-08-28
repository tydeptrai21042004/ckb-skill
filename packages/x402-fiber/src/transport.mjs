const HEADER_LIMIT_BYTES = 16 * 1024;

export function encodeHeaderJson(value) {
  const raw = JSON.stringify(value);
  const encoded = Buffer.from(raw, "utf8").toString("base64");
  if (Buffer.byteLength(encoded, "ascii") > HEADER_LIMIT_BYTES) {
    throw new Error("x402 header exceeds local safety limit");
  }
  return encoded;
}

export function decodeHeaderJson(value, label = "x402 header") {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is missing`);
  if (Buffer.byteLength(value, "ascii") > HEADER_LIMIT_BYTES) throw new Error(`${label} is too large`);
  let parsed;
  try {
    const raw = Buffer.from(value, "base64").toString("utf8");
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid base64-encoded JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must decode to an object`);
  return parsed;
}
