const MAX_CANONICAL_DEPTH = 24;
const MAX_CANONICAL_KEYS = 10_000;

function assertJsonValue(value, depth, counter) {
  if (depth > MAX_CANONICAL_DEPTH) throw new Error("JSON input nesting is too deep");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON input contains a non-finite number");
    return;
  }
  if (Array.isArray(value)) {
    counter.count += value.length;
    if (counter.count > MAX_CANONICAL_KEYS) throw new Error("JSON input is too complex");
    for (const item of value) assertJsonValue(item, depth + 1, counter);
    return;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    counter.count += keys.length;
    if (counter.count > MAX_CANONICAL_KEYS) throw new Error("JSON input is too complex");
    for (const key of keys) {
      if (typeof value[key] === "undefined") throw new Error("JSON input contains undefined");
      assertJsonValue(value[key], depth + 1, counter);
    }
    return;
  }
  throw new Error("input must contain JSON-compatible values only");
}

function canonicalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

/** Stable JSON serialization shared by browser and server for signed intent hashing. */
export function canonicalJson(value) {
  assertJsonValue(value, 0, { count: 0 });
  return canonicalize(value);
}

export function normalizeServiceSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) {
    throw new Error("service slug must be 1..64 lowercase letters, numbers, or hyphens");
  }
  return slug;
}

export function createServiceRegistry(services = []) {
  if (!Array.isArray(services) || services.length === 0) throw new Error("at least one service is required");
  const bySlug = new Map();
  const byId = new Map();
  for (const raw of services) {
    const slug = normalizeServiceSlug(raw.slug);
    const id = String(raw.id || "").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(id)) throw new Error(`service ${slug} has an invalid 32-byte id`);
    if (bySlug.has(slug)) throw new Error(`duplicate service slug ${slug}`);
    if (byId.has(id)) throw new Error(`duplicate service id ${id}`);
    if (typeof raw.execute !== "function") throw new Error(`service ${slug} is missing execute()`);
    const item = Object.freeze({
      slug,
      id,
      name: String(raw.name || slug),
      description: String(raw.description || ""),
      inputKind: raw.inputKind === "text" ? "text" : "json",
      maxInputChars: Number(raw.maxInputChars || 20_000),
      kind: String(raw.kind || "builtin"),
      operationMode: raw.operationMode === "read" ? "read" : "read",
      execute: raw.execute,
    });
    if (!Number.isSafeInteger(item.maxInputChars) || item.maxInputChars < 1 || item.maxInputChars > 256_000) {
      throw new Error(`service ${slug} maxInputChars must be 1..256000`);
    }
    bySlug.set(slug, item);
    byId.set(id, item);
  }
  return Object.freeze({
    services: Object.freeze([...bySlug.values()]),
    getBySlug(slug) { return bySlug.get(normalizeServiceSlug(slug)) || null; },
    getById(id) { return byId.get(String(id || "").toLowerCase()) || null; },
    publicList() {
      return Object.freeze([...bySlug.values()].map(({ execute, ...service }) => Object.freeze(service)));
    },
  });
}

export function validateServiceInput(service, input) {
  if (!service) throw new Error("service is required");
  if (service.inputKind === "text") {
    if (typeof input !== "string") throw new Error("service input must be text");
    if (!input.trim()) throw new Error("service input must not be empty");
    if (input.length > service.maxInputChars) throw new Error(`service input exceeds ${service.maxInputChars} characters`);
    return input;
  }
  canonicalJson(input);
  const serialized = canonicalJson(input);
  if (serialized.length > service.maxInputChars) throw new Error(`service input exceeds ${service.maxInputChars} characters`);
  return input;
}
