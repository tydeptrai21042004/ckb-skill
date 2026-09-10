import http from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { ccc } from "@ckb-ccc/ccc";
import {
  FLAG_DELEGATABLE,
  FLAG_REVOCABLE,
  FLAG_TRANSFERABLE,
  decodeCapability,
  encodeTypeArgs,
  hasFlag,
  isActive,
  normalizeHex32,
} from "@skillpass/capability-codec";
import { SERVICE_BUNDLE_V1_ENTITLEMENT_ID } from "@skillpass/capability-codec/service-ids";
import {
  FacilitatorHttpClient,
  FIBER_MAINNET,
  FIBER_TESTNET,
  FIBER_TRANSFER_METHOD,
  decodeHeaderJson,
  encodeHeaderJson,
  makePaymentRequired,
  validatePayload,
} from "@skillpass/x402-fiber";
import { createLiveRuntimeState } from "./runtime-state.mjs";
import { buildAgentSpec, buildDiscovery, buildOpenApi } from "./discovery.mjs";
import { buildServiceRegistry } from "./services.mjs";
import { canonicalJson, validateServiceInput } from "@skillpass/service-gateway";
import { assertDelegationScope, buildDelegationMessage } from "@skillpass/delegation";
import {
  assertJsonRequest,
  assertRequestEnvelope,
  baseSecurityHeaders,
  publicErrorMessage,
  rejectCrossSiteBrowserRequest,
  safeRequestUrl,
} from "../../packages/http-security/src/index.mjs";
import {
  ServiceRightError,
  createServicePolicy,
  policyAcceptsEntitlement,
  verifyDelegationPolicy,
  verifyServicePolicy,
} from "../../packages/service-rights/src/index.mjs";


function readSecret(name) {
  const file = String(process.env[`${name}_FILE`] || "").trim();
  if (file) return readFileSync(file, "utf8").trim();
  return String(process.env[name] || "").trim();
}

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_DIR = process.env.PUBLIC_DIR || join(dirname(fileURLToPath(import.meta.url)), "public");
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const SERVICE_STATE_FILE = process.env.SERVICE_STATE_FILE || join(process.cwd(), ".runtime", "service-state.json");
const STATE_BACKEND = String(process.env.STATE_BACKEND || (process.env.VERCEL ? "postgres" : "local")).trim();
const SERVICE_RECEIPT_TTL_SECONDS = Number(process.env.SERVICE_RECEIPT_TTL_SECONDS || 86400);
const SERVICE_POLICY_ID = String(process.env.SERVICE_POLICY_ID || "service-bundle-v1").trim();
const SERVICE_POLICY_URL = String(process.env.SERVICE_POLICY_URL || "").trim();
const SERVICE_TERMS_HASH_RAW = String(process.env.SERVICE_TERMS_HASH || "").trim();
const STARTED_AT = Date.now();
const IS_VERCEL = Boolean(process.env.VERCEL);
const IS_PUBLIC_PRODUCTION = IS_VERCEL || process.env.NODE_ENV === "production" || process.env.SKILLPASS_PUBLIC_PRODUCTION === "true";
const MAX_BODY = Number(process.env.MAX_REQUEST_BODY_BYTES || 36 * 1024);
const PAYMENT_HEADER_MAX_BYTES = Number(process.env.PAYMENT_HEADER_MAX_BYTES || 12 * 1024);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8_000);
const serviceRegistry = buildServiceRegistry({ env: process.env, production: IS_PUBLIC_PRODUCTION, timeoutMs: UPSTREAM_TIMEOUT_MS });
const CONFIGURED_PRIMARY_SERVICE_SLUG = String(process.env.SKILLPASS_PRIMARY_SERVICE || "").trim().toLowerCase();
const PRIMARY_SERVICE = CONFIGURED_PRIMARY_SERVICE_SLUG
  ? serviceRegistry.getBySlug(CONFIGURED_PRIMARY_SERVICE_SLUG)
  : (serviceRegistry.getBySlug("model-api-v1") || serviceRegistry.services[0]);
if (!PRIMARY_SERVICE) {
  if (CONFIGURED_PRIMARY_SERVICE_SLUG) throw new Error(`SKILLPASS_PRIMARY_SERVICE is not enabled: ${CONFIGURED_PRIMARY_SERVICE_SLUG}`);
  throw new Error("SkillPass requires at least one enabled service");
}
const SERVICE_ID = PRIMARY_SERVICE.id; // backward-compatible primary service id
const CHALLENGE_RATE_LIMIT = Number(process.env.CHALLENGE_RATE_LIMIT_PER_MINUTE || 12);
const ANALYZE_RATE_LIMIT = Number(process.env.ANALYZE_RATE_LIMIT_PER_MINUTE || 8);
const CAPABILITY_STATUS_RATE_LIMIT = Number(process.env.CAPABILITY_STATUS_RATE_LIMIT_PER_MINUTE || 24);
const GLOBAL_CHALLENGE_RATE_LIMIT = Number(process.env.GLOBAL_CHALLENGE_RATE_LIMIT_PER_MINUTE || 240);
const GLOBAL_ANALYZE_RATE_LIMIT = Number(process.env.GLOBAL_ANALYZE_RATE_LIMIT_PER_MINUTE || 120);
const GLOBAL_CAPABILITY_STATUS_RATE_LIMIT = Number(process.env.GLOBAL_CAPABILITY_STATUS_RATE_LIMIT_PER_MINUTE || 600);
const ENABLE_DEEP_HEALTH = process.env.ENABLE_DEEP_HEALTH === "true";
const DEEP_HEALTH_TOKEN = readSecret("DEEP_HEALTH_TOKEN");
const CHALLENGE_TTL_MS = Number(process.env.CHALLENGE_TTL_MS || 60_000);
const ENABLE_PUBLIC_ISSUE = process.env.ENABLE_PUBLIC_ISSUE === "true";
const PAYMENTS_REQUIRED = process.env.PAYMENTS_REQUIRED === "true";
const PAYMENT_AMOUNT = String(process.env.PAYMENT_AMOUNT || "100000");
const PAYMENT_ASSET = String(process.env.PAYMENT_ASSET || "CKB");
const PAYMENT_DECIMALS = Number(process.env.PAYMENT_DECIMALS || (PAYMENT_ASSET === "CKB" ? 8 : 0));
const PAYMENT_ATOMIC_UNIT = String(process.env.PAYMENT_ATOMIC_UNIT || (PAYMENT_ASSET === "CKB" ? "shannon" : "atomic unit"));
const PAYMENT_PAY_TO = String(process.env.PAYMENT_PAY_TO || "fiber-invoice-receiver");
const PAYMENT_CURRENCY = String(process.env.PAYMENT_CURRENCY || "Fibt");
const PAYMENT_TIMEOUT_SECONDS = Number(process.env.PAYMENT_TIMEOUT_SECONDS || 600);
const PAYMENT_PRUNE_INTERVAL_MS = Number(process.env.PAYMENT_PRUNE_INTERVAL_MS || 30_000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 30_000);
const FIBER_NETWORK_NAME = process.env.FIBER_NETWORK || "testnet";
const FIBER_NETWORK = FIBER_NETWORK_NAME === "mainnet" ? FIBER_MAINNET : FIBER_TESTNET;
const FACILITATOR_URL = process.env.FACILITATOR_URL || "http://127.0.0.1:8790";
const FACILITATOR_AUTH_TOKEN = readSecret("FACILITATOR_AUTH_TOKEN");
const facilitator = PAYMENTS_REQUIRED
  ? new FacilitatorHttpClient({ baseUrl: FACILITATOR_URL, token: FACILITATOR_AUTH_TOKEN, timeoutMs: UPSTREAM_TIMEOUT_MS })
  : null;

if (!Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT must be 1..65535");
if (!Number.isSafeInteger(MAX_BODY) || MAX_BODY < 8 * 1024 || MAX_BODY > 64 * 1024) throw new Error("MAX_REQUEST_BODY_BYTES must be 8192..65536");
if (!Number.isSafeInteger(PAYMENT_HEADER_MAX_BYTES) || PAYMENT_HEADER_MAX_BYTES < 1024 || PAYMENT_HEADER_MAX_BYTES > 16 * 1024) throw new Error("PAYMENT_HEADER_MAX_BYTES must be 1024..16384");
if (!Number.isSafeInteger(UPSTREAM_TIMEOUT_MS) || UPSTREAM_TIMEOUT_MS < 1000 || UPSTREAM_TIMEOUT_MS > 15_000) throw new Error("UPSTREAM_TIMEOUT_MS must be 1000..15000");
for (const [name, value, max] of [
  ["CHALLENGE_RATE_LIMIT_PER_MINUTE", CHALLENGE_RATE_LIMIT, 120],
  ["ANALYZE_RATE_LIMIT_PER_MINUTE", ANALYZE_RATE_LIMIT, 60],
  ["CAPABILITY_STATUS_RATE_LIMIT_PER_MINUTE", CAPABILITY_STATUS_RATE_LIMIT, 240],
  ["GLOBAL_CHALLENGE_RATE_LIMIT_PER_MINUTE", GLOBAL_CHALLENGE_RATE_LIMIT, 5000],
  ["GLOBAL_ANALYZE_RATE_LIMIT_PER_MINUTE", GLOBAL_ANALYZE_RATE_LIMIT, 2000],
  ["GLOBAL_CAPABILITY_STATUS_RATE_LIMIT_PER_MINUTE", GLOBAL_CAPABILITY_STATUS_RATE_LIMIT, 10_000],
]) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${name} must be 1..${max}`);
}
if (!Number.isSafeInteger(CHALLENGE_TTL_MS) || CHALLENGE_TTL_MS < 5_000 || CHALLENGE_TTL_MS > 10 * 60_000) throw new Error("CHALLENGE_TTL_MS must be 5000..600000");
if (!Number.isSafeInteger(SERVICE_RECEIPT_TTL_SECONDS) || SERVICE_RECEIPT_TTL_SECONDS < 60 || SERVICE_RECEIPT_TTL_SECONDS > 30 * 24 * 3600) {
  throw new Error("SERVICE_RECEIPT_TTL_SECONDS must be 60..2592000");
}
if (PUBLIC_BASE_URL && !/^https?:\/\//i.test(PUBLIC_BASE_URL)) throw new Error("PUBLIC_BASE_URL must start with http:// or https://");
if (IS_PUBLIC_PRODUCTION && PUBLIC_BASE_URL && !PUBLIC_BASE_URL.startsWith("https://")) throw new Error("PUBLIC_BASE_URL must use https:// in public production");
if (IS_PUBLIC_PRODUCTION && PAYMENTS_REQUIRED && !PUBLIC_BASE_URL && !IS_VERCEL) {
  throw new Error("PUBLIC_BASE_URL is required for paid public production outside Vercel");
}
if (IS_PUBLIC_PRODUCTION && PAYMENTS_REQUIRED && FACILITATOR_AUTH_TOKEN.length < 32) {
  throw new Error("FACILITATOR_AUTH_TOKEN must be at least 32 characters when payments are enabled in public production");
}
{
  const facilitatorUrl = new URL(FACILITATOR_URL);
  if (!["http:", "https:"].includes(facilitatorUrl.protocol)) throw new Error("FACILITATOR_URL must use http:// or https://");
  if (facilitatorUrl.username || facilitatorUrl.password) throw new Error("FACILITATOR_URL must not embed credentials");
  if (facilitatorUrl.search || facilitatorUrl.hash) throw new Error("FACILITATOR_URL must not contain a query string or fragment");
  if (IS_PUBLIC_PRODUCTION && !IS_VERCEL && facilitatorUrl.protocol !== "https:") {
    const host = facilitatorUrl.hostname.toLowerCase();
    const privateServiceName = /^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(host);
    const loopback = ["localhost", "127.0.0.1", "::1"].includes(host);
    if (!privateServiceName && !loopback) {
      throw new Error("public production may use an http:// facilitator only on a private single-label or loopback hostname");
    }
  }
}
if (IS_PUBLIC_PRODUCTION && ENABLE_PUBLIC_ISSUE) throw new Error("ENABLE_PUBLIC_ISSUE=true is forbidden in the hardened public production profile");
if (IS_PUBLIC_PRODUCTION && process.env.ALLOW_DEV_PAYMENT === "true") throw new Error("ALLOW_DEV_PAYMENT=true is forbidden in public production");
if (IS_PUBLIC_PRODUCTION && STATE_BACKEND === "local") throw new Error("STATE_BACKEND=local is forbidden in public production; use postgres");
if (ENABLE_DEEP_HEALTH && IS_PUBLIC_PRODUCTION && DEEP_HEALTH_TOKEN.length < 32) throw new Error("DEEP_HEALTH_TOKEN must be at least 32 characters when deep health is enabled in public production");
if (!/^[1-9][0-9]*$/.test(PAYMENT_AMOUNT)) throw new Error("PAYMENT_AMOUNT must be a positive atomic-unit integer string");
if (!Number.isSafeInteger(PAYMENT_TIMEOUT_SECONDS) || PAYMENT_TIMEOUT_SECONDS < 1 || PAYMENT_TIMEOUT_SECONDS > 3600) {
  throw new Error("PAYMENT_TIMEOUT_SECONDS must be 1..3600");
}
if (!Number.isSafeInteger(PAYMENT_PRUNE_INTERVAL_MS) || PAYMENT_PRUNE_INTERVAL_MS < 5_000 || PAYMENT_PRUNE_INTERVAL_MS > 10 * 60_000) {
  throw new Error("PAYMENT_PRUNE_INTERVAL_MS must be 5000..600000");
}
if (!Number.isSafeInteger(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS < 10_000 || REQUEST_TIMEOUT_MS > 60_000) {
  throw new Error("REQUEST_TIMEOUT_MS must be 10000..60000");
}
if (FIBER_NETWORK_NAME !== "testnet") throw new Error("This CKB-testnet service requires FIBER_NETWORK=testnet");
if (!PAYMENT_ASSET.trim()) throw new Error("PAYMENT_ASSET must not be empty");
if (!Number.isSafeInteger(PAYMENT_DECIMALS) || PAYMENT_DECIMALS < 0 || PAYMENT_DECIMALS > 18) throw new Error("PAYMENT_DECIMALS must be 0..18");
if (!PAYMENT_ATOMIC_UNIT.trim() || PAYMENT_ATOMIC_UNIT.length > 32) throw new Error("PAYMENT_ATOMIC_UNIT must be 1..32 characters");
if (!PAYMENT_PAY_TO.trim()) throw new Error("PAYMENT_PAY_TO must not be empty");
if (!PAYMENT_CURRENCY.trim()) throw new Error("PAYMENT_CURRENCY must not be empty");

function parseServicePaymentAmounts() {
  const raw = String(process.env.SKILLPASS_SERVICE_PRICES_JSON || "").trim();
  if (!raw) return new Map();
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error("SKILLPASS_SERVICE_PRICES_JSON must be a JSON object"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SKILLPASS_SERVICE_PRICES_JSON must be a JSON object");
  const prices = new Map();
  for (const [slug, amountValue] of Object.entries(value)) {
    const service = serviceRegistry.getBySlug(slug);
    if (!service) throw new Error(`SKILLPASS_SERVICE_PRICES_JSON contains unknown service ${slug}`);
    const amount = String(amountValue);
    if (!/^[1-9][0-9]*$/.test(amount)) throw new Error(`service price for ${slug} must be a positive atomic-unit integer string`);
    prices.set(service.slug, amount);
  }
  return prices;
}

const SERVICE_PAYMENT_AMOUNTS = parseServicePaymentAmounts();
function paymentAmountFor(service) { return SERVICE_PAYMENT_AMOUNTS.get(service.slug) || PAYMENT_AMOUNT; }

function requireHex32(name, value) {
  try { return normalizeHex32(value, name); }
  catch { throw new Error(`${name} must be a 32-byte 0x-prefixed hex value`); }
}

const deployment = Object.freeze({
  network: "testnet",
  codeHash: requireHex32("CAPABILITY_CODE_HASH", process.env.CAPABILITY_CODE_HASH),
  hashType: String(process.env.CAPABILITY_HASH_TYPE || "").trim(),
  depTxHash: requireHex32("CAPABILITY_DEP_TX_HASH", process.env.CAPABILITY_DEP_TX_HASH),
  depIndex: Number(process.env.CAPABILITY_DEP_INDEX || 0),
});
if (!["data", "data1", "data2", "type"].includes(deployment.hashType)) throw new Error("CAPABILITY_HASH_TYPE is required and must be data, data1, data2, or type");
if (!Number.isSafeInteger(deployment.depIndex) || deployment.depIndex < 0) throw new Error("CAPABILITY_DEP_INDEX is invalid");

function parseTrustedIssuerIds() {
  const values = [
    ...String(process.env.CAPABILITY_TRUSTED_ISSUER_IDS || "").split(","),
    String(process.env.CAPABILITY_TRUSTED_ISSUER_ID || ""),
  ].map((value) => value.trim()).filter(Boolean);
  if (!values.length) throw new Error("CAPABILITY_TRUSTED_ISSUER_ID or CAPABILITY_TRUSTED_ISSUER_IDS is required");
  const normalized = values.map((value, index) => requireHex32(`CAPABILITY_TRUSTED_ISSUER_IDS[${index}]`, value).toLowerCase());
  return Object.freeze([...new Set(normalized)].sort());
}

function parseBooleanPolicy(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  throw new Error(`${label} must be boolean`);
}

function parsePolicyUrl(value, label) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${label} must use http:// or https://`);
  if (IS_PUBLIC_PRODUCTION && url.protocol !== "https:") throw new Error(`${label} must use https:// in public production`);
  return raw;
}

function parseServicePolicyOverrides() {
  const raw = String(process.env.SKILLPASS_SERVICE_POLICIES_JSON || "").trim();
  if (!raw) return {};
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error("SKILLPASS_SERVICE_POLICIES_JSON must be a JSON object"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SKILLPASS_SERVICE_POLICIES_JSON must be a JSON object");
  const normalized = {};
  for (const [slug, item] of Object.entries(value)) {
    // Old public demos used research-oriented service names. Ignore those stale
    // entries during migration so an existing Vercel environment does not fail
    // to boot after the Service Bundle catalog replaces them.
    if (["paper-analyzer-v1", "research-insights-v1"].includes(slug)) continue;
    if (!serviceRegistry.getBySlug(slug)) throw new Error(`SKILLPASS_SERVICE_POLICIES_JSON contains unknown service ${slug}`);
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`service policy for ${slug} must be an object`);
    normalized[slug] = item;
  }
  return normalized;
}

const TRUSTED_ISSUER_IDS = parseTrustedIssuerIds();
const PRIMARY_TRUSTED_ISSUER_RAW = String(process.env.CAPABILITY_TRUSTED_ISSUER_ID || "").trim();
const TRUSTED_ISSUER_ID = PRIMARY_TRUSTED_ISSUER_RAW
  ? requireHex32("CAPABILITY_TRUSTED_ISSUER_ID", PRIMARY_TRUSTED_ISSUER_RAW).toLowerCase()
  : TRUSTED_ISSUER_IDS[0]; // backward-compatible primary issuer, explicitly preferred during key rotation
const SERVICE_TERMS_HASH = SERVICE_TERMS_HASH_RAW ? requireHex32("SERVICE_TERMS_HASH", SERVICE_TERMS_HASH_RAW) : "";
const DEFAULT_RIGHT_MODE = String(process.env.SERVICE_RIGHT_MODE || "owned").trim().toLowerCase();
const SKILLPASS_ADMIN_TOKEN = readSecret("SKILLPASS_ADMIN_TOKEN");
const SERVICE_POLICY_OVERRIDES = parseServicePolicyOverrides();
if (!SERVICE_POLICY_ID || SERVICE_POLICY_ID.length > 128) throw new Error("SERVICE_POLICY_ID must be 1..128 characters");
if (!["owned", "license"].includes(DEFAULT_RIGHT_MODE)) throw new Error("SERVICE_RIGHT_MODE must be owned or license");
const DEFAULT_POLICY_URL = parsePolicyUrl(SERVICE_POLICY_URL, "SERVICE_POLICY_URL");

const serviceContexts = new Map(serviceRegistry.services.map((service) => {
  const override = SERVICE_POLICY_OVERRIDES[service.slug] || {};
  const policyId = String(override.policyId || (service.slug === PRIMARY_SERVICE.slug ? SERVICE_POLICY_ID : `${SERVICE_POLICY_ID}:${service.slug}`)).trim();
  if (!policyId || policyId.length > 128) throw new Error(`policyId for ${service.slug} must be 1..128 characters`);
  const trustedIssuerSource = override.trustedIssuerIds ?? override.trustedIssuerId ?? TRUSTED_ISSUER_IDS;
  const isDefaultBundleService = ["model-api-v1", "private-data-api-v1", "compute-api-v1"].includes(service.slug);
  const defaultEntitlementIds = isDefaultBundleService ? [SERVICE_BUNDLE_V1_ENTITLEMENT_ID] : [service.id];
  const rawEntitlementIds = override.entitlementIds ?? override.acceptedEntitlementIds ?? defaultEntitlementIds;
  const entitlementIds = (Array.isArray(rawEntitlementIds) ? rawEntitlementIds : [rawEntitlementIds])
    .map((value, index) => requireHex32(`${service.slug}.entitlementIds[${index}]`, value).toLowerCase());
  const issuanceEntitlementId = requireHex32(`${service.slug}.issuanceEntitlementId`, override.issuanceEntitlementId || entitlementIds[0]).toLowerCase();
  const termsHash = override.termsHash ? requireHex32(`${service.slug}.termsHash`, override.termsHash) : SERVICE_TERMS_HASH;
  const policyUrl = parsePolicyUrl(override.url ?? DEFAULT_POLICY_URL, `${service.slug}.url`);
  const policy = createServicePolicy({
    serviceId: service.id,
    entitlementIds,
    issuanceEntitlementId,
    bundleId: override.bundleId ?? (isDefaultBundleService ? "service-bundle-v1" : ""),
    trustedIssuerIds: trustedIssuerSource,
    requireTransferable: parseBooleanPolicy(override.requireTransferable, true, `${service.slug}.requireTransferable`),
    delegationAllowed: parseBooleanPolicy(override.delegationAllowed, true, `${service.slug}.delegationAllowed`),
    requireDelegatable: parseBooleanPolicy(override.requireDelegatable, false, `${service.slug}.requireDelegatable`),
    rightMode: override.rightMode || DEFAULT_RIGHT_MODE,
    policyId,
    termsHash,
    requireSubjectBinding: parseBooleanPolicy(override.requireSubjectBinding, false, `${service.slug}.requireSubjectBinding`),
    acceptedSubjectTypes: override.acceptedSubjectTypes ?? [],
    requiredPolicyHash: override.requiredPolicyHash || "",
  });
  const fingerprintMaterial = canonicalJson({
    serviceId: policy.serviceId,
    entitlementIds: policy.entitlementIds,
    issuanceEntitlementId: policy.issuanceEntitlementId,
    bundleId: policy.bundleId,
    trustedIssuerIds: policy.trustedIssuerIds,
    requireTransferable: policy.requireTransferable,
    delegationAllowed: policy.delegationAllowed,
    requireDelegatable: policy.requireDelegatable,
    rightMode: policy.rightMode,
    policyId: policy.policyId,
    termsHash: policy.termsHash,
    requireSubjectBinding: policy.requireSubjectBinding,
    acceptedSubjectTypes: policy.acceptedSubjectTypes,
    requiredPolicyHash: policy.requiredPolicyHash,
    url: policyUrl,
  });
  const fingerprint = createHash("sha256").update(fingerprintMaterial).digest("hex");
  return [service.slug, Object.freeze({ service, policy, policyId, policyUrl, fingerprint })];
}));

function serviceContext(value) {
  const service = typeof value === "string" ? serviceRegistry.getBySlug(value) : value;
  if (!service) throw Object.assign(new Error("unknown SkillPass service"), { status: 404, code: "UNKNOWN_SERVICE" });
  return serviceContexts.get(service.slug);
}

function publicPolicyFor(service) {
  const context = serviceContext(service);
  const policy = context.policy;
  return Object.freeze({
    id: context.policyId,
    fingerprint: context.fingerprint,
    serviceId: policy.serviceId,
    entitlementIds: policy.entitlementIds,
    issuanceEntitlementId: policy.issuanceEntitlementId,
    bundleId: policy.bundleId || null,
    trustedIssuerId: policy.trustedIssuerIds[0],
    trustedIssuerIds: policy.trustedIssuerIds,
    rightMode: policy.rightMode,
    transferableRequired: policy.requireTransferable,
    delegationAllowed: policy.delegationAllowed,
    delegatableRequired: policy.requireDelegatable,
    termsHash: policy.termsHash || null,
    requireSubjectBinding: policy.requireSubjectBinding,
    acceptedSubjectTypes: policy.acceptedSubjectTypes,
    requiredPolicyHash: policy.requiredPolicyHash || null,
    url: context.policyUrl || null,
  });
}

function contextsAcceptingCapability(capability, nowUnixSeconds = BigInt(Math.floor(Date.now() / 1000))) {
  return [...serviceContexts.values()].filter((context) => {
    try {
      verifyServicePolicy({ capability, policy: context.policy, nowUnixSeconds });
      return true;
    } catch { return false; }
  });
}

function publicServiceDescriptor(service) {
  const context = serviceContext(service);
  return Object.freeze({
    ...service,
    endpoint: `/api/invoke/${service.slug}`,
    policyId: context.policyId,
    policyFingerprint: context.fingerprint,
    policy: publicPolicyFor(service),
    entitlementIds: context.policy.entitlementIds,
    issuanceEntitlementId: context.policy.issuanceEntitlementId,
    bundleId: context.policy.bundleId || null,
    rightMode: context.policy.rightMode,
    transferableRequired: context.policy.requireTransferable,
    delegationAllowed: context.policy.delegationAllowed,
    delegatableRequired: context.policy.requireDelegatable,
    trustedIssuerId: context.policy.trustedIssuerIds[0],
    trustedIssuerIds: context.policy.trustedIssuerIds,
    payment: publicPaymentConfig(service),
  });
}

function buildProviderManifest() {
  const services = serviceRegistry.publicList().map(publicServiceDescriptor);
  const providerIds = [...new Set(services.map((service) => service.providerId).filter(Boolean))];
  const providerNames = [...new Set(services.map((service) => service.providerName).filter(Boolean))];
  const manifest = {
    schemaVersion: "1.0",
    protocol: "skillpass-provider-manifest",
    network: "ckb-testnet",
    provider: {
      id: providerIds.length === 1 ? providerIds[0] : "multi-provider-gateway",
      name: providerNames.length === 1 ? providerNames[0] : "SkillPass multi-provider gateway",
    },
    ownershipSource: "current-live-capability-cell-owner",
    entitlementSynchronizationRequired: false,
    services: services.map((service) => ({
      slug: service.slug, id: service.id, name: service.name, endpoint: service.endpoint,
      operationMode: service.operationMode, idempotencyMode: service.idempotencyMode || null,
      entitlementIds: service.entitlementIds, policyId: service.policyId,
      policyFingerprint: service.policyFingerprint, trustedIssuerIds: service.trustedIssuerIds,
      delegationAllowed: service.delegationAllowed, payment: service.payment,
    })),
  };
  const manifestHash = createHash("sha256").update(canonicalJson(manifest)).digest("hex");
  const externalSignature = String(process.env.SKILLPASS_PROVIDER_MANIFEST_SIGNATURE || "").trim();
  return Object.freeze({ ...manifest, manifestHash: `sha256:${manifestHash}`, signature: externalSignature || null });
}

const servicePolicy = serviceContext(PRIMARY_SERVICE).policy; // backward-compatible primary references
const SERVICE_POLICY_FINGERPRINT = serviceContext(PRIMARY_SERVICE).fingerprint;
const HAS_LICENSE_POLICIES = [...serviceContexts.values()].some((context) => context.policy.rightMode === "license");
if (IS_PUBLIC_PRODUCTION && HAS_LICENSE_POLICIES && SKILLPASS_ADMIN_TOKEN.length < 32) {
  throw new Error("SKILLPASS_ADMIN_TOKEN must be at least 32 characters when a public production service uses rightMode=license");
}

if (process.env.CKB_RPC_URL) {
  const rpc = new URL(process.env.CKB_RPC_URL);
  if (!['http:', 'https:'].includes(rpc.protocol)) throw new Error("CKB_RPC_URL must use http:// or https://");
  if (IS_PUBLIC_PRODUCTION && rpc.protocol !== 'https:') throw new Error("CKB_RPC_URL must use https:// in public production");
  if (IS_VERCEL && /^(localhost|127\.0\.0\.1|::1)$/i.test(rpc.hostname)) throw new Error("CKB_RPC_URL cannot point to localhost from Vercel");
}

const client = process.env.CKB_RPC_URL
  ? new ccc.ClientPublicTestnet(process.env.CKB_RPC_URL)
  : new ccc.ClientPublicTestnet();

function publicPaymentConfig(service = PRIMARY_SERVICE) {
  return PAYMENTS_REQUIRED
    ? { required: true, amount: paymentAmountFor(service), asset: PAYMENT_ASSET, decimals: PAYMENT_DECIMALS, atomicUnit: PAYMENT_ATOMIC_UNIT, network: FIBER_NETWORK, x402Version: 2, proofMode: process.env.FIBER_PAYMENT_PROOF || "invoice-status" }
    : { required: false };
}

const runtimeState = await createLiveRuntimeState({
  backend: STATE_BACKEND,
  stateFile: SERVICE_STATE_FILE,
  challengeTtlMs: CHALLENGE_TTL_MS,
});
const serviceState = runtimeState.serviceState;
const challenges = runtimeState.challenges;
const rateLimiter = runtimeState.rateLimiter;
const delegationUsage = runtimeState.delegationUsage;
const READINESS_CACHE_MS = 30_000;
let readinessCache = null;
let readinessInFlight = null;

function outPointFromJson(value) {
  if (!value || typeof value !== "object") throw new Error("outPoint is required");
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(value.txHash || ""))) throw new Error("outPoint.txHash is invalid");
  let index;
  try { index = BigInt(value.index); } catch { throw new Error("outPoint.index is invalid"); }
  if (index < 0n || index > 0xffff_ffffn) throw new Error("outPoint.index must be 0..4294967295");
  return ccc.OutPoint.from({ txHash: String(value.txHash).toLowerCase(), index });
}

function outPointBinding(value) {
  const outPoint = outPointFromJson(value);
  return `${String(outPoint.txHash).toLowerCase()}:${String(outPoint.index)}`;
}

function requestInputHash(service, input) {
  const material = service.inputKind === "text" ? String(input || "") : canonicalJson(input);
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function normalizeRequestHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("requestHash must be a SHA-256 hex digest");
  return hash;
}

function normalizeOperationId(value, { required = false } = {}) {
  const operationId = String(value || "").trim();
  if (!operationId) {
    if (required) throw Object.assign(new Error("operationId is required for idempotent-action services"), { status: 400, code: "OPERATION_ID_REQUIRED" });
    return "";
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(operationId)) {
    throw Object.assign(new Error("operationId must be 8..128 safe identifier characters"), { status: 400, code: "INVALID_OPERATION_ID" });
  }
  return operationId;
}

function challengeMessage({ nonce, address, expiresAt, outPoint, requestHash, service, delegationId = "", operationId = "" }) {
  const context = serviceContext(service);
  const lines = [
    "SkillPass capability access",
    "action=invoke",
    `service=${context.service.slug}`,
    `service_id=${context.service.id}`,
    `policy_id=${context.policyId}`,
    `policy_fingerprint=${context.fingerprint}`,
    `capability_outpoint=${outPointBinding(outPoint)}`,
    `request_hash=${normalizeRequestHash(requestHash)}`,
  ];
  if (context.service.operationMode === "idempotent-action") {
    lines.push(`operation_id=${normalizeOperationId(operationId, { required: true })}`);
  }
  lines.push(
    `delegation_id=${String(delegationId || "direct")}`,
    `address=${address}`,
    `nonce=${nonce}`,
    `expires_at=${expiresAt}`,
  );
  return lines.join("\n");
}

async function issueChallenge(address, outPoint, requestHash, service, delegationId = "", operationId = "") {
  await ccc.Address.fromString(address, client);
  outPointFromJson(outPoint);
  normalizeRequestHash(requestHash);
  const context = serviceContext(service);
  normalizeOperationId(operationId, { required: context.service.operationMode === "idempotent-action" });
  return challenges.issue(address, ({ nonce, identity, expiresAt }) =>
    challengeMessage({ nonce, address: identity, expiresAt, outPoint, requestHash, service: context.service, delegationId, operationId }),
  );
}

async function consumeChallenge(nonce, address) {
  return challenges.consume({ nonce, identity: address });
}

function challengeMatchesRequest(challenge, body, service) {
  const expected = challengeMessage({
    nonce: body.nonce,
    address: body.address,
    expiresAt: challenge.expiresAt,
    outPoint: body.outPoint,
    requestHash: requestInputHash(service, body.input),
    service,
    delegationId: body.delegation?.grant?.grantId || "",
    operationId: body.operationId || "",
  });
  const left = Buffer.from(String(challenge.message || ""));
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function withTimeout(promise, label, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out`), { status: 503, code: "UPSTREAM_TIMEOUT" })), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function inspectLiveCapability({ outPoint, service = null, skipRevocation = false }) {
  const cell = await withTimeout(client.getCellLive(outPoint, true, true), "CKB RPC");
  if (!cell) throw Object.assign(new Error("capability cell is missing or already consumed"), { status: 403, code: "CELL_NOT_LIVE" });
  const type = cell.cellOutput.type;
  if (!type || type.codeHash !== deployment.codeHash || type.hashType !== deployment.hashType) {
    throw Object.assign(new Error("cell is not a SkillPass capability from this deployment"), { status: 403, code: "WRONG_DEPLOYMENT" });
  }
  const capability = decodeCapability(cell.outputData);
  if (type.args.toLowerCase() !== encodeTypeArgs(capability).toLowerCase()) {
    throw Object.assign(new Error("capability identity/data mismatch"), { status: 403, code: "IDENTITY_MISMATCH" });
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  let context;
  const acceptingContexts = contextsAcceptingCapability(capability, now);
  if (service) {
    context = serviceContext(service);
  } else {
    const directService = serviceRegistry.getById(capability.serviceId);
    const directContext = directService ? serviceContext(directService) : null;
    context = directContext && acceptingContexts.includes(directContext) ? directContext : acceptingContexts[0];
    if (!context) throw Object.assign(new Error("capability is not accepted by any configured SkillPass service"), { status: 403, code: "WRONG_SERVICE" });
  }

  try {
    verifyServicePolicy({ capability, policy: context.policy, nowUnixSeconds: now });
  } catch (error) {
    if (error instanceof ServiceRightError) {
      throw Object.assign(new Error(error.message), { status: 403, code: error.code });
    }
    throw error;
  }

  if (!skipRevocation && context.policy.rightMode === "license") {
    const revocation = await serviceState.getRevocation(context.service.slug, capability.capabilityId);
    if (revocation) {
      throw Object.assign(new Error("provider revoked this service license"), {
        status: 403,
        code: "PROVIDER_REVOKED",
        revocation,
      });
    }
  }

  return {
    cell,
    capability,
    service: context.service,
    policy: context.policy,
    policyId: context.policyId,
    policyFingerprint: context.fingerprint,
    currentOwnerLockHash: normalizeHex32(cell.cellOutput.lock.hash(), "currentOwnerLockHash"),
    acceptedByServices: acceptingContexts.map((candidate) => candidate.service.slug),
    checkedAt: new Date().toISOString(),
  };
}

async function verifyLiveCapability({ outPoint, requesterAddress, service }) {
  const inspected = await inspectLiveCapability({ outPoint, service });
  const requester = await ccc.Address.fromString(requesterAddress, client);
  if (!inspected.cell.cellOutput.lock.eq(requester.script)) {
    throw Object.assign(new Error("requester does not control the current live capability cell"), { status: 403, code: "NOT_OWNER" });
  }
  return inspected;
}

async function verifyDelegatedCapability({ credential, delegateAddress, outPoint, service }) {
  if (!credential || typeof credential !== "object" || !credential.grant || !credential.ownerSignature) {
    throw Object.assign(new Error("delegation credential is malformed"), { status: 401, code: "INVALID_DELEGATION" });
  }
  const context = serviceContext(service);
  if (!context.policy.delegationAllowed) {
    throw Object.assign(new Error("provider policy does not allow agent delegation for this service"), { status: 403, code: "DELEGATION_DISABLED" });
  }
  const grant = assertDelegationScope(credential.grant, {
    delegateAddress,
    serviceSlug: service.slug,
    serviceId: service.id,
    outPoint,
    action: "invoke",
    now: Date.now(),
  });
  if (credential.ownerSignature.identity !== grant.ownerAddress) {
    throw Object.assign(new Error("delegation owner signature identity mismatch"), { status: 401, code: "DELEGATION_OWNER_MISMATCH" });
  }
  const ownerSignatureValid = await ccc.Signer.verifyMessage(buildDelegationMessage(grant), credential.ownerSignature);
  if (!ownerSignatureValid) throw Object.assign(new Error("delegation owner signature is invalid"), { status: 401, code: "INVALID_DELEGATION_SIGNATURE" });
  const inspected = await verifyLiveCapability({ outPoint, requesterAddress: grant.ownerAddress, service });
  try {
    verifyDelegationPolicy({ capability: inspected.capability, policy: inspected.policy });
  } catch (error) {
    if (error instanceof ServiceRightError) {
      throw Object.assign(new Error(error.message), { status: 403, code: error.code });
    }
    throw error;
  }
  if (inspected.capability.capabilityId.toLowerCase() !== grant.capabilityId.toLowerCase()) {
    throw Object.assign(new Error("delegation capability identity mismatch"), { status: 401, code: "DELEGATION_CAPABILITY_MISMATCH" });
  }
  return { ...inspected, delegation: grant, principalAddress: delegateAddress, ownerAddress: grant.ownerAddress };
}

function actionInvocationKey(body, service) {
  const operationId = normalizeOperationId(body.operationId, { required: true });
  return createHash("sha256").update(canonicalJson({
    serviceId: service.id,
    capabilityOutPoint: outPointBinding(body.outPoint),
    operationId,
  })).digest("hex");
}

function delegationInvocationKey(body, payment, service) {
  if (service.operationMode === "idempotent-action") return actionInvocationKey(body, service);
  if (payment?.hash && /^[0-9a-f]{64}$/i.test(String(payment.hash))) return String(payment.hash).toLowerCase();
  return createHash("sha256")
    .update(`${String(body.delegation?.grant?.grantId || "direct")}:${String(body.nonce || "")}`)
    .digest("hex");
}

function delegationBudgetInput(verified, body, service, payment) {
  const grant = verified?.delegation;
  if (!grant || grant.version < 2 || !grant.limits) return null;
  return {
    grantId: grant.grantId,
    invocationKey: delegationInvocationKey(body, payment, service),
    maxUses: grant.limits.maxUses,
    maxSpendAtomic: grant.limits.maxSpendAtomic,
    spendAtomic: PAYMENTS_REQUIRED ? paymentAmountFor(service) : "0",
    expiresAt: grant.expiresAt,
  };
}

async function reserveDelegationBudget(verified, body, service, payment) {
  const input = delegationBudgetInput(verified, body, service, payment);
  if (!input) return null;
  return { input, usage: await delegationUsage.reserve(input) };
}

async function commitDelegationBudget(reservation) {
  if (!reservation) return null;
  return delegationUsage.commit(reservation.input);
}

async function releaseDelegationBudget(reservation) {
  if (!reservation) return null;
  return delegationUsage.release(reservation.input);
}

function paymentBinding(req, body, service) {
  const context = serviceContext(service);
  const normalized = canonicalJson({
    address: String(body.address || ""),
    ownerAddress: String(body.delegation?.grant?.ownerAddress || body.address || ""),
    delegationId: String(body.delegation?.grant?.grantId || "direct"),
    outPoint: { txHash: String(body.outPoint?.txHash || "").toLowerCase(), index: String(body.outPoint?.index ?? "") },
    requestHash: requestInputHash(service, body.input),
    operationId: service.operationMode === "idempotent-action" ? normalizeOperationId(body.operationId, { required: true }) : null,
    serviceId: service.id,
    paymentAmount: PAYMENTS_REQUIRED ? paymentAmountFor(service) : "0",
    policyId: context.policyId,
    policyFingerprint: context.fingerprint,
    resource: resourceUrl(req, service),
  });
  return createHash("sha256").update(normalized).digest("hex");
}

function resourceUrl(req, service) {
  const path = `/api/invoke/${service.slug}`;
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}${path}`;
  if (IS_VERCEL) {
    const vercelHost = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
    if (/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(vercelHost)) return `https://${vercelHost}${path}`;
    throw Object.assign(new Error("Vercel canonical production URL is unavailable"), { status: 503, code: "PUBLIC_URL_UNAVAILABLE" });
  }
  if (!TRUST_PROXY) return `http://127.0.0.1:${PORT}${path}`;
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!/^(https?)$/.test(proto) || !/^[A-Za-z0-9.:[\]-]+$/.test(host)) throw new Error("invalid proxy host/protocol headers");
  return `${proto}://${host}${path}`;
}

let lastPaymentPruneAt = 0;
let paymentPruneInFlight = null;
const quoteInFlight = new Map();

async function maybePrunePaymentState({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastPaymentPruneAt < PAYMENT_PRUNE_INTERVAL_MS) return;
  if (paymentPruneInFlight) return paymentPruneInFlight;
  paymentPruneInFlight = Promise.all([
    serviceState.pruneExpiredQuotes(),
    serviceState.pruneExpiredReceipts(SERVICE_RECEIPT_TTL_SECONDS * 1000),
  ]).then(() => { lastPaymentPruneAt = Date.now(); }).finally(() => { paymentPruneInFlight = null; });
  return paymentPruneInFlight;
}

async function createPaymentQuote(req, body, service) {
  validateServiceInput(service, body.input);
  await maybePrunePaymentState();
  const binding = paymentBinding(req, body, service);
  const existing = await serviceState.getQuoteByBinding(binding);
  if (existing) return makePaymentRequired({ resource: existing.resource, requirement: existing.requirement });
  if (quoteInFlight.has(binding)) return quoteInFlight.get(binding);

  const pending = (async () => {
    const raced = await serviceState.getQuoteByBinding(binding);
    if (raced) return makePaymentRequired({ resource: raced.resource, requirement: raced.requirement });
    const servicePaymentAmount = paymentAmountFor(service);
    const invoice = await withTimeout(facilitator.invoice({
      amount: servicePaymentAmount,
      currency: PAYMENT_CURRENCY,
      description: `SkillPass ${service.slug}`,
      expiry: PAYMENT_TIMEOUT_SECONDS,
    }), "facilitator invoice");
    const requirement = {
      scheme: "exact",
      network: FIBER_NETWORK,
      amount: servicePaymentAmount,
      asset: PAYMENT_ASSET,
      payTo: PAYMENT_PAY_TO,
      maxTimeoutSeconds: PAYMENT_TIMEOUT_SECONDS,
      extra: {
        assetTransferMethod: FIBER_TRANSFER_METHOD,
        paymentFlow: "authorization",
        invoice: invoice.invoice,
        paymentHash: invoice.paymentHash,
      },
    };
    const resource = {
      url: resourceUrl(req, service),
      description: `SkillPass protected ${service.name}`,
      mimeType: "application/json",
      serviceName: "SkillPass",
      tags: ["ckb", "fiber", "portable-rights", "agent-access", service.kind],
    };
    const required = makePaymentRequired({ resource, requirement });
    await serviceState.setQuote(String(invoice.paymentHash).toLowerCase(), {
      requirement,
      resource,
      binding,
      service: service.slug,
      expiresAt: Date.now() + PAYMENT_TIMEOUT_SECONDS * 1000,
    });
    return required;
  })().finally(() => quoteInFlight.delete(binding));

  quoteInFlight.set(binding, pending);
  return pending;
}

async function verifyPaymentHeader(req, body, service) {
  const header = req.headers["payment-signature"];
  if (!header) return null;
  if (Buffer.byteLength(String(header)) > PAYMENT_HEADER_MAX_BYTES) {
    throw Object.assign(new Error("payment signature header is too large"), { status: 431, code: "PAYMENT_HEADER_TOO_LARGE" });
  }
  await maybePrunePaymentState();
  const paymentPayload = decodeHeaderJson(String(header), "PAYMENT-SIGNATURE");
  const hash = String(paymentPayload?.payload?.paymentHash || "").toLowerCase();
  const binding = paymentBinding(req, body, service);

  // If the server settled this exact semantic request but the HTTP response was
  // lost, return the persisted receipt after fresh wallet/capability auth.
  const receipt = await serviceState.getReceipt(hash);
  if (receipt && receipt.binding === binding) {
    validatePayload(paymentPayload, receipt.requirement);
    return { hash, paymentPayload, alreadySettled: true, receipt };
  }

  const quote = await serviceState.getQuote(hash);
  if (!quote || Date.now() >= Number(quote.expiresAt || 0)) {
    throw Object.assign(new Error("payment quote is missing or expired; request a fresh 402"), { status: 402, code: "PAYMENT_QUOTE_UNKNOWN" });
  }
  if (quote.binding !== binding) {
    throw Object.assign(new Error("payment quote belongs to a different capability/request"), { status: 402, code: "PAYMENT_REQUEST_BINDING_MISMATCH" });
  }
  const verification = await withTimeout(facilitator.verify({ x402Version: 2, paymentPayload, paymentRequirements: quote.requirement }), "facilitator verify");
  if (!verification?.isValid) {
    // A persisted quote plus facilitator replay evidence means settlement may
    // have completed immediately before a service crash. The protected paper
    // analyzer is side-effect free, so we can recompute the result and call the
    // idempotent settle endpoint to recover delivery without charging again.
    if (verification?.invalidReason === "payment_already_consumed") {
      return { hash, quote, paymentPayload, verification, binding, recoverConsumedSettlement: true };
    }
    throw Object.assign(new Error(verification?.invalidReason || "Fiber payment could not be verified"), { status: 402, code: verification?.invalidReason || "PAYMENT_NOT_VERIFIED", paymentRequired: makePaymentRequired({ resource: quote.resource, requirement: quote.requirement, error: verification?.invalidReason || "payment not verified" }) });
  }
  return { hash, quote, paymentPayload, verification, binding, recoverConsumedSettlement: false };
}

async function settlePayment(payment, result) {
  if (!payment) return null;
  if (payment.alreadySettled) return payment.receipt.settlement;
  const settlement = await withTimeout(facilitator.settle({ x402Version: 2, paymentPayload: payment.paymentPayload, paymentRequirements: payment.quote.requirement }), "facilitator settle");
  if (!settlement?.success) {
    throw Object.assign(new Error(settlement?.errorReason || "Fiber payment settlement failed"), { status: 402, code: settlement?.errorReason || "PAYMENT_SETTLEMENT_FAILED" });
  }
  // Persist the delivery receipt before replying. A client can safely retry the
  // same paid request after a dropped connection/server restart.
  await serviceState.setReceipt(payment.hash, { binding: payment.binding, requirement: payment.quote.requirement, settlement, result });
  await serviceState.deleteQuote(payment.hash);
  return settlement;
}

function requestKey(req) {
  if (IS_VERCEL) {
    const forwarded = String(req.headers["x-vercel-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded.slice(0, 128);
  } else if (TRUST_PROXY) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded.slice(0, 128);
  }
  return req.socket.remoteAddress || "unknown";
}

const localBurst = new Map();
const globalBlockedUntil = new Map();
function localPreLimit(subject, route, limit, windowMs = 60_000) {
  const now = Date.now();
  const subjectHash = createHash("sha256").update(String(subject || "unknown")).digest("hex").slice(0, 24);
  const key = `${route}:${subjectHash}`;
  let item = localBurst.get(key);
  if (!item || now >= item.resetAt) item = { count: 0, resetAt: now + windowMs };
  item.count += 1;
  localBurst.set(key, item);
  if (localBurst.size > 5000) {
    for (const [k, v] of localBurst) if (now >= v.resetAt) localBurst.delete(k);
    while (localBurst.size > 5000) localBurst.delete(localBurst.keys().next().value);
  }
  if (item.count > limit) {
    throw Object.assign(new Error("rate limit exceeded"), { status: 429, code: "RATE_LIMITED", retryAfterSeconds: Math.max(1, Math.ceil((item.resetAt - now) / 1000)) });
  }
}

async function rateLimit(req, route, perIpLimit, globalLimit, windowMs = 60_000) {
  const subject = requestKey(req);
  const blockedUntil = globalBlockedUntil.get(route) || 0;
  if (Date.now() < blockedUntil) {
    throw Object.assign(new Error("service capacity guard reached"), {
      status: 429,
      code: "GLOBAL_RATE_LIMITED",
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)),
    });
  }
  // Cheap per-instance burst gate prevents a single hot instance from turning
  // every abusive request into a database query. PostgreSQL remains the shared
  // limiter across Vercel instances.
  localPreLimit(subject, route, Math.max(2, Math.ceil(perIpLimit * 1.5)), windowMs);

  const perIp = await rateLimiter.consume(`${route}:ip:${subject}`, { limit: perIpLimit, windowMs });
  if (!perIp.allowed) {
    throw Object.assign(new Error("rate limit exceeded"), { status: 429, code: "RATE_LIMITED", retryAfterSeconds: perIp.retryAfterSeconds });
  }

  const global = await rateLimiter.consume(`${route}:global`, { limit: globalLimit, windowMs });
  if (!global.allowed) {
    globalBlockedUntil.set(route, Date.now() + Math.max(1000, global.retryAfterSeconds * 1000));
    throw Object.assign(new Error("service capacity guard reached"), { status: 429, code: "GLOBAL_RATE_LIMITED", retryAfterSeconds: global.retryAfterSeconds });
  }
}

async function jsonBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("request body too large"), { status: 413, code: "BODY_TOO_LARGE" });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error("request body must be valid JSON"), { status: 400, code: "INVALID_JSON" }); }
}

function validateProtectedShape(body, service) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("request body must be a JSON object"), { status: 400, code: "INVALID_BODY" });
  if (typeof body.address !== "string" || body.address.length < 8 || body.address.length > 256) throw Object.assign(new Error("address is invalid"), { status: 400, code: "INVALID_ADDRESS" });
  if (typeof body.nonce !== "string" || !/^[0-9a-f]{48}$/i.test(body.nonce)) throw Object.assign(new Error("nonce is invalid"), { status: 400, code: "INVALID_NONCE" });
  if (!body.signature || typeof body.signature !== "object" || body.signature.identity !== body.address) {
    throw Object.assign(new Error("SkillPass requires a CKB-native wallet signature bound to the acting CKB address"), { status: 401, code: "IDENTITY_NOT_BOUND" });
  }
  validateServiceInput(service, body.input);
  normalizeOperationId(body.operationId, { required: service.operationMode === "idempotent-action" });
  outPointFromJson(body.outPoint);
}

async function authenticateProtectedRequest(body, service) {
  validateProtectedShape(body, service);
  const challenge = await consumeChallenge(body.nonce, body.address);
  if (!challengeMatchesRequest(challenge, body, service)) {
    throw Object.assign(new Error("signed challenge does not match this capability/request"), { status: 401, code: "CHALLENGE_INTENT_MISMATCH" });
  }
  const valid = await ccc.Signer.verifyMessage(challenge.message, body.signature);
  if (!valid) throw Object.assign(new Error("wallet signature is invalid"), { status: 401, code: "INVALID_SIGNATURE" });
  if (body.delegation) {
    return verifyDelegatedCapability({ credential: body.delegation, delegateAddress: body.address, outPoint: body.outPoint, service });
  }
  const inspected = await verifyLiveCapability({ outPoint: outPointFromJson(body.outPoint), requesterAddress: body.address, service });
  return { ...inspected, principalAddress: body.address, ownerAddress: body.address, delegation: null };
}

function normalizeInvokeBody(raw, service) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (Object.prototype.hasOwnProperty.call(raw, "input")) return raw;
  // Backward-compatible /api/analyze clients send `text` instead of `input`.
  if (service.slug === PRIMARY_SERVICE.slug && Object.prototype.hasOwnProperty.call(raw, "text")) {
    return { ...raw, input: raw.text };
  }
  return raw;
}

function bearerMatches(req, expected) {
  if (!expected) return false;
  const header = String(req.headers.authorization || "");
  const value = header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function requireProviderAdmin(req) {
  if (SKILLPASS_ADMIN_TOKEN.length < 32) {
    throw Object.assign(new Error("provider administration is not configured"), { status: 503, code: "ADMIN_NOT_CONFIGURED" });
  }
  if (!bearerMatches(req, SKILLPASS_ADMIN_TOKEN)) {
    throw Object.assign(new Error("provider administration authentication required"), { status: 401, code: "ADMIN_AUTH_REQUIRED" });
  }
}

function licenseContext(serviceSlug) {
  const context = serviceContext(serviceSlug);
  if (context.policy.rightMode !== "license") {
    throw Object.assign(new Error("provider revocation is only available for rightMode=license"), { status: 409, code: "REVOCATION_NOT_ALLOWED" });
  }
  return context;
}

function cleanAdminReason(value) {
  return String(value || "provider policy revocation")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || "provider policy revocation";
}

const LIVE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self' https://*.ckb.dev https://*.ckbapp.dev wss://*.ckb.dev wss://*.ckbapp.dev",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
].join("; ");

function securityHeaders(contentType) {
  const headers = baseSecurityHeaders({
    contentType,
    csp: LIVE_CSP,
    // CCC/wallet UI is a third-party browser surface. Report Trusted Types
    // violations first; once the deployed wallet matrix is browser-tested, this
    // can be promoted to the enforced CSP without breaking compatible wallets.
    trustedTypesReportOnly: true,
  });
  if (IS_PUBLIC_PRODUCTION) headers["strict-transport-security"] = "max-age=31536000";
  return headers;
}
function sendJson(res, status, body, extraHeaders = {}) {
  const requestId = res.__skillpassRequestId || randomUUID();
  res.writeHead(status, { ...securityHeaders("application/json; charset=utf-8"), "cache-control": "no-store", "x-request-id": requestId, ...extraHeaders });
  res.end(JSON.stringify(body));
}
function sendText(res, status, body, extraHeaders = {}) {
  const requestId = res.__skillpassRequestId || randomUUID();
  res.writeHead(status, { ...securityHeaders("text/plain; charset=utf-8"), "cache-control": "no-store", "x-request-id": requestId, ...extraHeaders });
  res.end(String(body));
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const staticCache = new Map();

async function cachedStaticFile(file) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("not a file");
  const key = `${info.mtimeMs}:${info.size}`;
  const cached = staticCache.get(file);
  if (cached?.key === key) return cached;
  const body = await readFile(file);
  const value = { key, body, etag: `W/\"${Math.trunc(info.mtimeMs).toString(16)}-${info.size.toString(16)}\"` };
  staticCache.set(file, value);
  if (staticCache.size > 64) staticCache.delete(staticCache.keys().next().value);
  return value;
}

async function sendStatic(req, res, pathname) {
  let requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  requested = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  let file = join(PUBLIC_DIR, requested);
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, "index.html");
    const asset = await cachedStaticFile(file);
    const immutable = /(?:^|\/)assets\/[^/]+-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/.test(requested);
    const headers = {
      ...securityHeaders(mime[extname(file)] || "application/octet-stream"),
      "cache-control": requested === "index.html" ? "no-cache" : immutable ? "public, max-age=31536000, immutable" : "public, max-age=300",
      etag: asset.etag,
    };
    if (String(req.headers["if-none-match"] || "") === asset.etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    res.writeHead(200, headers);
    res.end(asset.body);
    return true;
  } catch {
    if (!requested.includes(".")) {
      try {
        const file = join(PUBLIC_DIR, "index.html");
        const asset = await cachedStaticFile(file);
        const headers = { ...securityHeaders("text/html; charset=utf-8"), "cache-control": "no-cache", etag: asset.etag };
        if (String(req.headers["if-none-match"] || "") === asset.etag) { res.writeHead(304, headers); res.end(); return true; }
        res.writeHead(200, headers);
        res.end(asset.body); return true;
      } catch {}
    }
    return false;
  }
}

async function computeReadiness() {
  const dependencies = {
    ckb: { ok: false },
    facilitator: { ok: !PAYMENTS_REQUIRED, skipped: !PAYMENTS_REQUIRED },
    state: { ok: false, backend: STATE_BACKEND },
  };
  let tip = null;

  try {
    tip = (await withTimeout(client.getTip(), "CKB tip")).toString();
    dependencies.ckb = { ok: true };
  } catch (error) {
    dependencies.ckb = { ok: false, error: "CKB RPC unavailable" };
  }

  if (PAYMENTS_REQUIRED) {
    try {
      const upstream = await withTimeout(facilitator.ready(), "facilitator readiness");
      dependencies.facilitator = {
        ok: Boolean(upstream?.ok),
        mode: upstream?.mode,
        paymentProof: upstream?.paymentProof,
        upstream: upstream?.upstream ? { ok: Boolean(upstream.upstream.ok), backend: upstream.upstream.backend, version: upstream.upstream.version } : undefined,
      };
    } catch (error) {
      dependencies.facilitator = { ok: false, error: "facilitator unavailable" };
    }
  }

  try {
    const storage = await runtimeState.health();
    dependencies.state = {
      ok: Boolean(storage.ok),
      backend: storage.backend,
      postgres: storage.postgres,
      redis: storage.redis,
    };
  } catch (error) {
    dependencies.state = { ok: false, backend: STATE_BACKEND, error: "state backend unavailable" };
  }

  const ok = dependencies.ckb.ok && dependencies.facilitator.ok && dependencies.state.ok;
  return {
    ok,
    mode: "ckb-testnet",
    network: "testnet",
    tip,
    service: PRIMARY_SERVICE.slug,
    serviceCount: serviceRegistry.services.length,
    paymentsRequired: PAYMENTS_REQUIRED,
    paymentProof: PAYMENTS_REQUIRED ? (process.env.FIBER_PAYMENT_PROOF || "invoice-status") : "disabled",
    dependencies,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    checkedAt: new Date().toISOString(),
  };
}

async function readiness() {
  const now = Date.now();
  if (readinessCache && now - readinessCache.at < READINESS_CACHE_MS) return readinessCache.value;
  if (readinessInFlight) return readinessInFlight;
  readinessInFlight = computeReadiness()
    .then((value) => { readinessCache = { at: Date.now(), value }; return value; })
    .finally(() => { readinessInFlight = null; });
  return readinessInFlight;
}

async function handleInvokeRequest(req, res, service, rawBody) {
  const requestBody = normalizeInvokeBody(rawBody, service);
  validateProtectedShape(requestBody, service);
  await rateLimit(req, `invoke:${service.slug}`, ANALYZE_RATE_LIMIT, GLOBAL_ANALYZE_RATE_LIMIT);

  // Authentication + fresh live CKB ownership happen before Fiber work or the
  // protected service. Delegated requests additionally verify the owner-signed
  // grant and then re-check that the delegating owner still owns the live Cell.
  const verified = await authenticateProtectedRequest(requestBody, service);

  let payment = null;
  if (PAYMENTS_REQUIRED) {
    if (!req.headers["payment-signature"]) {
      const required = await createPaymentQuote(req, requestBody, service);
      return sendJson(res, 402, { error: "payment_required", message: "Fiber payment required; retry with a fresh wallet challenge and PAYMENT-SIGNATURE" }, { "PAYMENT-REQUIRED": encodeHeaderJson(required) });
    }
    payment = await verifyPaymentHeader(req, requestBody, service);
  }

  // Reserve bounded delegation quota before execution so concurrent requests
  // cannot oversubscribe the grant, but do not permanently charge the grant
  // until protected execution and optional payment settlement both succeed.
  const delegationReservation = await reserveDelegationBudget(verified, requestBody, service, payment);
  let delegationBudget = delegationReservation?.usage || null;
  let result;
  let settlement;
  try {
    result = payment?.alreadySettled
      ? payment.receipt.result
      : await service.execute(requestBody.input, {
          requestId: res.__skillpassRequestId,
          capabilityId: verified.capability.capabilityId,
          ownerAddress: verified.ownerAddress,
          principalAddress: verified.principalAddress,
          invocationKey: service.operationMode === "idempotent-action" ? actionInvocationKey(requestBody, service) : delegationInvocationKey(requestBody, payment, service),
        });
    settlement = await settlePayment(payment, result);
    delegationBudget = await commitDelegationBudget(delegationReservation);
  } catch (error) {
    // Failed read/query delivery must not burn a delegated use/spend budget.
    // Release is best-effort here; a durable backend can also reclaim stale
    // reservations after the bounded reservation TTL.
    try { await releaseDelegationBudget(delegationReservation); } catch {}
    throw error;
  }
  const headers = settlement ? { "PAYMENT-RESPONSE": encodeHeaderJson(settlement) } : {};
  return sendJson(res, 200, {
    ok: true,
    service: {
      slug: service.slug, id: service.id, name: service.name, kind: service.kind,
      operationMode: service.operationMode, providerId: service.providerId, providerName: service.providerName,
    },
    entitlement: {
      capabilityId: verified.capability.capabilityId,
      serviceId: verified.capability.serviceId,
      issuerId: verified.capability.issuerId,
      currentOwnerLockHash: verified.currentOwnerLockHash,
      policyId: verified.policyId,
      policyFingerprint: verified.policyFingerprint,
      checkedAt: verified.checkedAt,
      source: "live-ckb-cell",
    },
    authorization: {
      requestId: res.__skillpassRequestId,
      action: "invoke",
      operationId: service.operationMode === "idempotent-action" ? normalizeOperationId(requestBody.operationId, { required: true }) : null,
      principal: verified.delegation ? "delegate" : "owner",
      principalAddress: verified.principalAddress,
      ownerAddress: verified.ownerAddress,
      delegationId: verified.delegation?.grantId || null,
      delegationExpiresAt: verified.delegation?.expiresAt || null,
      delegationVersion: verified.delegation?.version || null,
      delegationLimits: verified.delegation?.limits || null,
      delegationUsage: delegationBudget,
      intentBound: true,
      entitlementVerified: true,
      paymentRequired: PAYMENTS_REQUIRED,
      paymentVerified: PAYMENTS_REQUIRED ? Boolean(settlement) : false,
    },
    result,
    payment: settlement,
  }, headers);
}

const server = http.createServer(async (req, res) => {
  res.__skillpassRequestId = randomUUID();
  try {
    assertRequestEnvelope(req);
    const url = safeRequestUrl(req);

    // Cheap, cacheable/public endpoints must never hit CKB, Fiber, or PostgreSQL.
    if (req.method === "GET" && url.pathname === "/livez") {
      return sendJson(res, 200, { ok: true, service: "skillpass-live" }, {
        "cache-control": "public, max-age=30",
        "vercel-cdn-cache-control": "max-age=60",
      });
    }
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "skillpass-live", mode: "ckb-testnet" }, {
        "cache-control": "public, max-age=30",
        "vercel-cdn-cache-control": "max-age=60",
      });
    }
    if (req.method === "GET" && url.pathname === "/.well-known/skillpass-agent.txt") {
      return sendText(res, 200, buildAgentSpec({
        services: serviceRegistry.publicList().map(publicServiceDescriptor),
        paymentsRequired: PAYMENTS_REQUIRED,
      }), {
        "cache-control": "public, max-age=300",
        "vercel-cdn-cache-control": "max-age=3600, stale-while-revalidate=86400",
      });
    }
    if (req.method === "GET" && url.pathname === "/.well-known/skillpass.json") {
      return sendJson(res, 200, buildDiscovery({
        deployment,
        services: serviceRegistry.publicList().map(publicServiceDescriptor),
        trustedIssuerId: TRUSTED_ISSUER_ID,
        trustedIssuerIds: TRUSTED_ISSUER_IDS,
        policy: publicPolicyFor(PRIMARY_SERVICE),
        payments: publicPaymentConfig(),
      }), {
        "cache-control": "public, max-age=60",
        "vercel-cdn-cache-control": "max-age=600, stale-while-revalidate=3600",
      });
    }
    if (req.method === "GET" && url.pathname === "/api/openapi.json") {
      return sendJson(res, 200, buildOpenApi({ services: serviceRegistry.publicList().map(publicServiceDescriptor), paymentsRequired: PAYMENTS_REQUIRED }), {
        "cache-control": "public, max-age=300",
        "vercel-cdn-cache-control": "max-age=3600, stale-while-revalidate=86400",
      });
    }
    if (req.method === "GET" && url.pathname === "/api/provider-manifest") {
      return sendJson(res, 200, buildProviderManifest(), {
        "cache-control": "public, max-age=60",
        "vercel-cdn-cache-control": "max-age=600, stale-while-revalidate=3600",
      });
    }
    if (req.method === "GET" && url.pathname === "/api/services") {
      return sendJson(res, 200, { ok: true, services: serviceRegistry.publicList().map(publicServiceDescriptor) }, {
        "cache-control": "public, max-age=60",
        "vercel-cdn-cache-control": "max-age=600, stale-while-revalidate=3600",
      });
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, {
        network: "testnet",
        deployment,
        serviceId: SERVICE_ID,
        service: PRIMARY_SERVICE.slug,
        services: serviceRegistry.publicList().map(publicServiceDescriptor),
        enablePublicIssue: ENABLE_PUBLIC_ISSUE,
        trustedIssuerId: TRUSTED_ISSUER_ID,
        trustedIssuerIds: TRUSTED_ISSUER_IDS,
        servicePolicy: publicPolicyFor(PRIMARY_SERVICE),
        limits: { maxInputChars: PRIMARY_SERVICE.maxInputChars },
        delegation: { enabled: [...serviceContexts.values()].some((context) => context.policy.delegationAllowed), maxLifetimeSeconds: 86400, model: "owner-signed-grant", versions: [1, 2], usageLimits: { maxUses: true, maxSpendAtomic: true, productionLedger: STATE_BACKEND !== "local" } },
        providerAdministration: { revocationSupported: HAS_LICENSE_POLICIES, endpoint: HAS_LICENSE_POLICIES ? "/api/admin/revocations" : null },
        payments: publicPaymentConfig(),
      }, {
        "cache-control": "public, max-age=60",
        "vercel-cdn-cache-control": "max-age=600, stale-while-revalidate=3600",
      });
    }

    // Public status is intentionally shallow. It avoids a 30-second browser poll
    // becoming an unlimited CKB/DB/Fiber bill. Protected requests still verify
    // CKB ownership against live chain state on every use.
    if (req.method === "GET" && url.pathname === "/api/status") {
      return sendJson(res, 200, {
        ok: true,
        mode: "ckb-testnet",
        network: "testnet",
        service: PRIMARY_SERVICE.slug,
        serviceCount: serviceRegistry.services.length,
        paymentsRequired: PAYMENTS_REQUIRED,
        paymentProof: PAYMENTS_REQUIRED ? (process.env.FIBER_PAYMENT_PROOF || "invoice-status") : "disabled",
        dependencies: {
          ckb: { ok: true, checked: "on-protected-request" },
          facilitator: { ok: true, skipped: !PAYMENTS_REQUIRED, checked: PAYMENTS_REQUIRED ? "on-payment-request" : "disabled" },
          state: { ok: true, backend: STATE_BACKEND, checked: "on-protected-request" },
        },
      }, {
        "cache-control": "public, max-age=30",
        "vercel-cdn-cache-control": "max-age=60, stale-while-revalidate=120",
      });
    }

    if (req.method === "GET" && url.pathname === "/readyz") {
      if (!ENABLE_DEEP_HEALTH) return sendJson(res, 404, { error: "not_found" });
      if (IS_PUBLIC_PRODUCTION && !bearerMatches(req, DEEP_HEALTH_TOKEN)) {
        return sendJson(res, 401, { error: "auth_required", message: "deep health authentication required" });
      }
      const report = await readiness();
      return sendJson(res, report.ok ? 200 : 503, report);
    }

    if (req.method === "POST" && url.pathname === "/api/capability/status") {
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
      const body = await jsonBody(req);
      const outPoint = outPointFromJson(body.outPoint);
      await rateLimit(req, "capability-status", CAPABILITY_STATUS_RATE_LIMIT, GLOBAL_CAPABILITY_STATUS_RATE_LIMIT);
      const requestedService = body.service ? serviceContext(body.service).service : null;
      const inspected = await inspectLiveCapability({ outPoint, service: requestedService });
      const proof = {
        schemaVersion: "1.1",
        network: "ckb-testnet",
        source: "live-ckb-cell",
        checkedAt: inspected.checkedAt,
        deployment: { codeHash: deployment.codeHash, hashType: deployment.hashType },
        outPoint: { txHash: String(outPoint.txHash).toLowerCase(), index: String(outPoint.index) },
        capability: {
          capabilityId: inspected.capability.capabilityId,
          serviceId: inspected.capability.serviceId,
          service: inspected.service.slug,
          acceptedByServices: inspected.acceptedByServices,
          issuerId: inspected.capability.issuerId,
          expiry: inspected.capability.expiry.toString(),
          currentOwnerLockHash: inspected.currentOwnerLockHash,
          transferable: hasFlag(inspected.capability, FLAG_TRANSFERABLE),
          delegatable: hasFlag(inspected.capability, FLAG_DELEGATABLE),
          revocable: hasFlag(inspected.capability, FLAG_REVOCABLE),
          rightMode: inspected.policy.rightMode,
          bundleId: inspected.policy.bundleId || null,
          entitlementIds: inspected.policy.entitlementIds,
          policyId: inspected.policyId,
          policyFingerprint: inspected.policyFingerprint,
        },
      };
      const proofHash = createHash("sha256").update(canonicalJson(proof)).digest("hex");
      return sendJson(res, 200, { ok: true, ...proof, proofHash });
    }

    if (req.method === "GET" && url.pathname === "/api/admin/revocations") {
      requireProviderAdmin(req);
      const serviceSlug = String(url.searchParams.get("service") || "").trim();
      if (!serviceSlug) throw Object.assign(new Error("service query parameter is required"), { status: 400, code: "SERVICE_REQUIRED" });
      const context = licenseContext(serviceSlug);
      const rawLimit = Number(url.searchParams.get("limit") || 100);
      const limit = Number.isSafeInteger(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 100;
      const revocations = await serviceState.listRevocations(context.service.slug, { limit });
      return sendJson(res, 200, { ok: true, service: context.service.slug, policy: publicPolicyFor(context.service), revocations });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/revocations") {
      requireProviderAdmin(req);
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
      const body = await jsonBody(req);
      const action = String(body.action || "").trim().toLowerCase();
      const context = licenseContext(String(body.service || "").trim());
      if (action === "revoke") {
        const outPoint = outPointFromJson(body.outPoint);
        const inspected = await inspectLiveCapability({ outPoint, service: context.service, skipRevocation: true });
        const record = await serviceState.setRevocation(context.service.slug, inspected.capability.capabilityId, {
          service: context.service.slug,
          capabilityId: inspected.capability.capabilityId.toLowerCase(),
          issuerId: inspected.capability.issuerId.toLowerCase(),
          entitlementServiceId: inspected.capability.serviceId.toLowerCase(),
          policyId: context.policyId,
          policyFingerprint: context.fingerprint,
          outPoint: { txHash: String(outPoint.txHash).toLowerCase(), index: String(outPoint.index) },
          reason: cleanAdminReason(body.reason),
          revokedAt: Date.now(),
        });
        return sendJson(res, 200, { ok: true, action: "revoke", revocation: record });
      }
      if (action === "restore") {
        let capabilityId;
        try { capabilityId = normalizeHex32(String(body.capabilityId || ""), "capabilityId").toLowerCase(); }
        catch { throw Object.assign(new Error("capabilityId must be a 32-byte hex value"), { status: 400, code: "INVALID_CAPABILITY_ID" }); }
        const existed = await serviceState.getRevocation(context.service.slug, capabilityId);
        const restored = await serviceState.deleteRevocation(context.service.slug, capabilityId);
        return sendJson(res, 200, { ok: true, action: "restore", service: context.service.slug, capabilityId, restored, previous: existed });
      }
      throw Object.assign(new Error("action must be revoke or restore"), { status: 400, code: "INVALID_ADMIN_ACTION" });
    }

    if (req.method === "POST" && url.pathname === "/api/challenge") {
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
      const { address, outPoint, requestHash, service: serviceSlug = PRIMARY_SERVICE.slug, delegationId = "", operationId = "" } = await jsonBody(req);
      if (typeof address !== "string" || address.length < 8 || address.length > 256) {
        throw Object.assign(new Error("address is invalid"), { status: 400, code: "INVALID_ADDRESS" });
      }
      const service = serviceContext(serviceSlug).service;
      if (delegationId && !/^[0-9a-f]{32}$/i.test(String(delegationId))) {
        throw Object.assign(new Error("delegationId is invalid"), { status: 400, code: "INVALID_DELEGATION_ID" });
      }
      outPointFromJson(outPoint);
      normalizeRequestHash(requestHash);
      await ccc.Address.fromString(address, client);
      await rateLimit(req, "challenge", CHALLENGE_RATE_LIMIT, GLOBAL_CHALLENGE_RATE_LIMIT);
      return sendJson(res, 200, await issueChallenge(address, outPoint, requestHash, service, delegationId, operationId));
    }

    if (req.method === "POST" && url.pathname === "/api/analyze") {
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
      return handleInvokeRequest(req, res, PRIMARY_SERVICE, await jsonBody(req));
    }

    const invokeMatch = req.method === "POST" ? url.pathname.match(/^\/api\/invoke\/([a-z0-9-]{1,64})$/) : null;
    if (invokeMatch) {
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
      const service = serviceContext(invokeMatch[1]).service;
      return handleInvokeRequest(req, res, service, await jsonBody(req));
    }

    if (url.pathname.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(req.method || "")) return sendJson(res, 405, { error: "method_not_allowed" }, { allow: "GET, HEAD, POST" });
      return sendJson(res, 404, { error: "not_found" });
    }
    if (req.method === "GET" || req.method === "HEAD") {
      if (await sendStatic(req, res, url.pathname)) return;
    }
    return sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    const status = error?.status || (error?.name === "FacilitatorHttpError" ? 503 : 400);
    const extraHeaders = error?.paymentRequired ? { "PAYMENT-REQUIRED": encodeHeaderJson(error.paymentRequired) } : {};
    if (status === 429) extraHeaders["retry-after"] = String(error?.retryAfterSeconds || 60);
    const message = status >= 500 ? "service temporarily unavailable" : publicErrorMessage(error);
    return sendJson(res, status, { error: error?.code || "bad_request", message }, extraHeaders);
  }
});

server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 80;

export { server };

export function startServer() {
  if (server.listening) return server;
  server.listen(PORT, HOST, () => {
  console.log(`SkillPass live service on http://${HOST}:${PORT}`);
  console.log(`CKB network: testnet; RPC: ${process.env.CKB_RPC_URL ? "custom endpoint configured" : "CCC default endpoint"}`);
  console.log(`Capability code hash: ${deployment.codeHash}`);
  console.log(`Trusted capability issuers: ${TRUSTED_ISSUER_IDS.length} configured (primary ${TRUSTED_ISSUER_ID})`);
  console.log(`Service policy: ${SERVICE_POLICY_ID}`);
  console.log(`x402/Fiber payments: ${PAYMENTS_REQUIRED ? `enabled via ${FACILITATOR_URL}` : "disabled"}`);
  console.log(`State backend: ${STATE_BACKEND}${STATE_BACKEND === "local" ? ` (${SERVICE_STATE_FILE})` : ""}`);
  console.log(`Delivery receipt retention: ${SERVICE_RECEIPT_TTL_SECONDS}s`);
  console.log("No user private key is loaded by this service.");
});
  return server;
}


let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`Received ${signal}; shutting down SkillPass live service`);
  await new Promise((resolve) => server.close(resolve));
  await runtimeState.close();
  process.exit(0);
}



if (!process.env.VERCEL) {
  startServer();
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
