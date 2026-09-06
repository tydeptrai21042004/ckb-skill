const errors = [];
const warnings = [];

function value(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}
function required(name) {
  const v = value(name);
  if (!v) errors.push(`${name} is required`);
  return v;
}
function bool(name, fallback = "false") {
  const v = value(name, fallback);
  if (!["true", "false"].includes(v)) errors.push(`${name} must be true or false`);
  return v === "true";
}
function integer(name, fallback, { min, max }) {
  const n = Number(value(name, String(fallback)));
  if (!Number.isSafeInteger(n) || n < min || n > max) errors.push(`${name} must be ${min}..${max}`);
  return n;
}
function requireHttpsIfSet(name) {
  const raw = value(name);
  if (!raw) return "";
  let url;
  try { url = new URL(raw); } catch { errors.push(`${name} must be a valid URL`); return raw; }
  if (url.protocol !== "https:") errors.push(`${name} must use https:// on public Vercel`);
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(url.hostname)) errors.push(`${name} cannot point to localhost from Vercel`);
  return raw;
}

for (const name of ["CAPABILITY_CODE_HASH", "CAPABILITY_DEP_TX_HASH"]) {
  const v = required(name);
  if (v && !/^0x[0-9a-fA-F]{64}$/.test(v)) errors.push(`${name} must be 0x + 64 hex characters`);
}
const hashType = required("CAPABILITY_HASH_TYPE");
if (!["data", "data1", "data2", "type"].includes(hashType)) errors.push("CAPABILITY_HASH_TYPE is invalid");
integer("CAPABILITY_DEP_INDEX", 0, { min: 0, max: 65535 });

if (value("STATE_BACKEND", "postgres") !== "postgres") errors.push("Vercel hardened profile requires STATE_BACKEND=postgres");
if (!value("DATABASE_URL")) errors.push("DATABASE_URL is required; connect Neon to this Vercel project");
integer("POSTGRES_POOL_MAX", 2, { min: 1, max: 3 });

if (!bool("TRUST_PROXY", "true")) errors.push("TRUST_PROXY=true is required on Vercel");
if (!bool("SKILLPASS_PUBLIC_PRODUCTION", "true")) errors.push("SKILLPASS_PUBLIC_PRODUCTION=true is required for the hardened Vercel profile");
if (bool("ENABLE_PUBLIC_ISSUE", "false")) errors.push("ENABLE_PUBLIC_ISSUE must stay false in public production");
if (bool("ALLOW_DEV_PAYMENT", "false")) errors.push("ALLOW_DEV_PAYMENT must stay false in public production");

integer("MAX_REQUEST_BODY_BYTES", 36864, { min: 8192, max: 49152 });
integer("PAYMENT_HEADER_MAX_BYTES", 12288, { min: 1024, max: 16384 });
integer("UPSTREAM_TIMEOUT_MS", 8000, { min: 1000, max: 10000 });
integer("FACILITATOR_MAX_REQUEST_BODY_BYTES", 32768, { min: 4096, max: 49152 });
integer("FIBER_RPC_TIMEOUT_MS", 8000, { min: 1000, max: 10000 });
integer("CHALLENGE_RATE_LIMIT_PER_MINUTE", 12, { min: 1, max: 30 });
integer("ANALYZE_RATE_LIMIT_PER_MINUTE", 8, { min: 1, max: 20 });
integer("GLOBAL_CHALLENGE_RATE_LIMIT_PER_MINUTE", 240, { min: 10, max: 1000 });
integer("GLOBAL_ANALYZE_RATE_LIMIT_PER_MINUTE", 120, { min: 10, max: 500 });

const authToken = required("FACILITATOR_AUTH_TOKEN");
if (authToken && authToken.length < 32) errors.push("FACILITATOR_AUTH_TOKEN must be at least 32 characters");

const deepHealth = bool("ENABLE_DEEP_HEALTH", "false");
if (deepHealth && value("DEEP_HEALTH_TOKEN").length < 32) errors.push("DEEP_HEALTH_TOKEN must be at least 32 characters when ENABLE_DEEP_HEALTH=true");

requireHttpsIfSet("CKB_RPC_URL");
const publicBase = value("PUBLIC_BASE_URL");
if (publicBase) {
  try {
    const url = new URL(publicBase);
    if (url.protocol !== "https:") errors.push("PUBLIC_BASE_URL must use https:// in public production");
  } catch { errors.push("PUBLIC_BASE_URL must be a valid URL"); }
}

const payments = bool("PAYMENTS_REQUIRED", "false");
if (value("FIBER_NETWORK", "testnet") !== "testnet") errors.push("This deployment must use FIBER_NETWORK=testnet");
if (payments) {
  if (value("FIBER_BACKEND") !== "fnn") errors.push("Real Vercel payments require FIBER_BACKEND=fnn");
  requireHttpsIfSet("FIBER_RPC_URL");
  if (!value("FIBER_RPC_URL")) errors.push("FIBER_RPC_URL is required when PAYMENTS_REQUIRED=true");
  if (!/^[1-9][0-9]*$/.test(value("PAYMENT_AMOUNT"))) errors.push("PAYMENT_AMOUNT must be a positive atomic-unit integer");
  required("PAYMENT_PAY_TO");
} else if (value("FIBER_BACKEND", "mock") !== "mock") {
  warnings.push("PAYMENTS_REQUIRED=false but FIBER_BACKEND is not mock; use mock for the cheapest/safest initial deployment");
}

if (errors.length) {
  console.error("SkillPass Vercel environment has errors:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  console.log("SkillPass hardened Vercel environment: OK");
}
if (warnings.length) {
  console.warn("Warnings:");
  for (const warning of warnings) console.warn(`  - ${warning}`);
}
