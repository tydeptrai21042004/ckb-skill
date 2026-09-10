import { createHash } from "node:crypto";

function requestFingerprint(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}

export function executeModelReference(input, provider) {
  const text = String(input).trim();
  if (!text) throw new Error("model input must not be empty");
  const tokens = text.split(/\s+/u).filter(Boolean);
  // Deterministic reference embedding: real protected computation without a
  // network dependency. A production provider can replace this with an HTTPS
  // model upstream while preserving the same SkillPass ownership boundary.
  const digest = createHash("sha256").update(text, "utf8").digest();
  const embedding = Array.from({ length: 8 }, (_, index) => Number(((digest[index] - 127.5) / 127.5).toFixed(6)));
  return {
    mode: "reference-compute",
    service: "model-api-v1",
    provider,
    requestFingerprint: requestFingerprint(text),
    inputCharacters: text.length,
    inputTokensApprox: tokens.length,
    embedding,
    note: "Deterministic reference embedding. Configure an HTTPS upstream for a real model provider.",
  };
}

const PROTECTED_REFERENCE_ROWS = Object.freeze([
  Object.freeze({ id: "asset-001", tier: "pro", region: "apac", status: "available" }),
  Object.freeze({ id: "asset-002", tier: "pro", region: "eu", status: "available" }),
  Object.freeze({ id: "asset-003", tier: "standard", region: "us", status: "archived" }),
  Object.freeze({ id: "asset-004", tier: "pro", region: "apac", status: "available" }),
  Object.freeze({ id: "asset-005", tier: "standard", region: "eu", status: "available" }),
]);

export function executePrivateDataReference(input, provider) {
  const query = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const region = typeof query.region === "string" ? query.region.trim().toLowerCase().slice(0, 24) : "";
  const tier = typeof query.tier === "string" ? query.tier.trim().toLowerCase().slice(0, 24) : "";
  const limitRaw = Number(query.limit ?? 3);
  const limit = Number.isSafeInteger(limitRaw) ? Math.max(1, Math.min(5, limitRaw)) : 3;
  const rows = PROTECTED_REFERENCE_ROWS
    .filter((row) => !region || row.region === region)
    .filter((row) => !tier || row.tier === tier)
    .slice(0, limit);
  return {
    mode: "reference-dataset",
    service: "private-data-api-v1",
    provider,
    requestFingerprint: requestFingerprint(query),
    query: { region: region || null, tier: tier || null, limit },
    rows,
    note: "Reference protected records. Configure an HTTPS upstream for provider-owned private data.",
  };
}

export function executeComputeReference(input, provider) {
  const raw = Array.isArray(input?.values) ? input.values : [];
  if (!raw.length) throw new Error("compute input.values must contain at least one number");
  if (raw.length > 1024) throw new Error("compute input.values supports at most 1024 numbers");
  const values = raw.map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value))) throw new Error("compute input.values must contain finite numbers only");
  const sum = values.reduce((acc, value) => acc + value, 0);
  const mean = sum / values.length;
  const l2 = Math.sqrt(values.reduce((acc, value) => acc + value * value, 0));
  const fingerprint = requestFingerprint(input);
  return {
    mode: "reference-compute",
    service: "compute-api-v1",
    provider,
    jobId: `job-${fingerprint}`,
    state: "succeeded",
    operation: "vector-summary",
    result: {
      count: values.length,
      sum: Number(sum.toFixed(8)),
      mean: Number(mean.toFixed(8)),
      l2: Number(l2.toFixed(8)),
    },
    requestFingerprint: fingerprint,
    note: "Actual deterministic compute completed. Production providers can replace this with an idempotent compute upstream.",
  };
}
