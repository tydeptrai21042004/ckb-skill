import http from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { ccc } from "@ckb-ccc/ccc";
import {
  decodeCapability,
  encodeTypeArgs,
  isActive,
  normalizeHex32,
} from "@skillpass/capability-codec";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "@skillpass/capability-codec/service-ids";
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
import { analyzePaper, validatePaperInput, MAX_INPUT_CHARS } from "../demo-service/src/paper-analyzer.mjs";
import { createLiveRuntimeState } from "./runtime-state.mjs";
import { buildDiscovery, buildOpenApi } from "./discovery.mjs";
import {
  assertJsonRequest,
  assertRequestEnvelope,
  baseSecurityHeaders,
  publicErrorMessage,
  rejectCrossSiteBrowserRequest,
  safeRequestUrl,
} from "../../packages/http-security/src/index.mjs";


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
const STATE_BACKEND = String(process.env.STATE_BACKEND || "local").trim();
const SERVICE_RECEIPT_TTL_SECONDS = Number(process.env.SERVICE_RECEIPT_TTL_SECONDS || 86400);
const SERVICE_ID = PAPER_ANALYZER_V1_SERVICE_ID;
const STARTED_AT = Date.now();
const IS_VERCEL = Boolean(process.env.VERCEL);
const IS_PUBLIC_PRODUCTION = IS_VERCEL || process.env.NODE_ENV === "production" || process.env.SKILLPASS_PUBLIC_PRODUCTION === "true";
const MAX_BODY = Number(process.env.MAX_REQUEST_BODY_BYTES || 36 * 1024);
const PAYMENT_HEADER_MAX_BYTES = Number(process.env.PAYMENT_HEADER_MAX_BYTES || 12 * 1024);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8_000);
const CHALLENGE_RATE_LIMIT = Number(process.env.CHALLENGE_RATE_LIMIT_PER_MINUTE || 12);
const ANALYZE_RATE_LIMIT = Number(process.env.ANALYZE_RATE_LIMIT_PER_MINUTE || 8);
const GLOBAL_CHALLENGE_RATE_LIMIT = Number(process.env.GLOBAL_CHALLENGE_RATE_LIMIT_PER_MINUTE || 240);
const GLOBAL_ANALYZE_RATE_LIMIT = Number(process.env.GLOBAL_ANALYZE_RATE_LIMIT_PER_MINUTE || 120);
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
  ["GLOBAL_CHALLENGE_RATE_LIMIT_PER_MINUTE", GLOBAL_CHALLENGE_RATE_LIMIT, 5000],
  ["GLOBAL_ANALYZE_RATE_LIMIT_PER_MINUTE", GLOBAL_ANALYZE_RATE_LIMIT, 2000],
]) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${name} must be 1..${max}`);
}
if (!Number.isSafeInteger(CHALLENGE_TTL_MS) || CHALLENGE_TTL_MS < 5_000 || CHALLENGE_TTL_MS > 10 * 60_000) throw new Error("CHALLENGE_TTL_MS must be 5000..600000");
if (!Number.isSafeInteger(SERVICE_RECEIPT_TTL_SECONDS) || SERVICE_RECEIPT_TTL_SECONDS < 60 || SERVICE_RECEIPT_TTL_SECONDS > 30 * 24 * 3600) {
  throw new Error("SERVICE_RECEIPT_TTL_SECONDS must be 60..2592000");
}
if (PUBLIC_BASE_URL && !/^https?:\/\//i.test(PUBLIC_BASE_URL)) throw new Error("PUBLIC_BASE_URL must start with http:// or https://");
if (IS_PUBLIC_PRODUCTION && PUBLIC_BASE_URL && !PUBLIC_BASE_URL.startsWith("https://")) throw new Error("PUBLIC_BASE_URL must use https:// in public production");
if (IS_PUBLIC_PRODUCTION && ENABLE_PUBLIC_ISSUE) throw new Error("ENABLE_PUBLIC_ISSUE=true is forbidden in the hardened public production profile");
if (IS_PUBLIC_PRODUCTION && process.env.ALLOW_DEV_PAYMENT === "true") throw new Error("ALLOW_DEV_PAYMENT=true is forbidden in public production");
if (IS_PUBLIC_PRODUCTION && STATE_BACKEND === "local") throw new Error("STATE_BACKEND=local is forbidden in public production; use postgres");
if (ENABLE_DEEP_HEALTH && IS_PUBLIC_PRODUCTION && DEEP_HEALTH_TOKEN.length < 32) throw new Error("DEEP_HEALTH_TOKEN must be at least 32 characters when deep health is enabled in public production");
if (!/^[1-9][0-9]*$/.test(PAYMENT_AMOUNT)) throw new Error("PAYMENT_AMOUNT must be a positive atomic-unit integer string");
if (!Number.isSafeInteger(PAYMENT_TIMEOUT_SECONDS) || PAYMENT_TIMEOUT_SECONDS < 1 || PAYMENT_TIMEOUT_SECONDS > 3600) {
  throw new Error("PAYMENT_TIMEOUT_SECONDS must be 1..3600");
}
if (FIBER_NETWORK_NAME !== "testnet") throw new Error("This CKB-testnet service requires FIBER_NETWORK=testnet");
if (!PAYMENT_ASSET.trim()) throw new Error("PAYMENT_ASSET must not be empty");
if (!Number.isSafeInteger(PAYMENT_DECIMALS) || PAYMENT_DECIMALS < 0 || PAYMENT_DECIMALS > 18) throw new Error("PAYMENT_DECIMALS must be 0..18");
if (!PAYMENT_ATOMIC_UNIT.trim() || PAYMENT_ATOMIC_UNIT.length > 32) throw new Error("PAYMENT_ATOMIC_UNIT must be 1..32 characters");
if (!PAYMENT_PAY_TO.trim()) throw new Error("PAYMENT_PAY_TO must not be empty");
if (!PAYMENT_CURRENCY.trim()) throw new Error("PAYMENT_CURRENCY must not be empty");

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

if (process.env.CKB_RPC_URL) {
  const rpc = new URL(process.env.CKB_RPC_URL);
  if (!['http:', 'https:'].includes(rpc.protocol)) throw new Error("CKB_RPC_URL must use http:// or https://");
  if (IS_PUBLIC_PRODUCTION && rpc.protocol !== 'https:') throw new Error("CKB_RPC_URL must use https:// in public production");
  if (IS_VERCEL && /^(localhost|127\.0\.0\.1|::1)$/i.test(rpc.hostname)) throw new Error("CKB_RPC_URL cannot point to localhost from Vercel");
}

const client = process.env.CKB_RPC_URL
  ? new ccc.ClientPublicTestnet(process.env.CKB_RPC_URL)
  : new ccc.ClientPublicTestnet();

function publicPaymentConfig() {
  return PAYMENTS_REQUIRED
    ? { required: true, amount: PAYMENT_AMOUNT, asset: PAYMENT_ASSET, decimals: PAYMENT_DECIMALS, atomicUnit: PAYMENT_ATOMIC_UNIT, network: FIBER_NETWORK, x402Version: 2, proofMode: process.env.FIBER_PAYMENT_PROOF || "invoice-status" }
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
const READINESS_CACHE_MS = 30_000;
let readinessCache = null;
let readinessInFlight = null;

function outPointFromJson(value) {
  if (!value || typeof value !== "object") throw new Error("outPoint is required");
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(value.txHash || ""))) throw new Error("outPoint.txHash is invalid");
  let index;
  try { index = BigInt(value.index); } catch { throw new Error("outPoint.index is invalid"); }
  if (index < 0n) throw new Error("outPoint.index must be non-negative");
  return ccc.OutPoint.from({ txHash: value.txHash, index });
}

function challengeMessage({ nonce, address, expiresAt }) {
  return [
    "SkillPass capability access",
    "service=paper-analyzer-v1",
    `address=${address}`,
    `nonce=${nonce}`,
    `expires_at=${expiresAt}`,
  ].join("\n");
}

async function issueChallenge(address) {
  await ccc.Address.fromString(address, client);
  return challenges.issue(address, ({ nonce, identity, expiresAt }) =>
    challengeMessage({ nonce, address: identity, expiresAt }),
  );
}

async function consumeChallenge(nonce, address) {
  return challenges.consume({ nonce, identity: address });
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

async function verifyLiveCapability({ outPoint, requesterAddress }) {
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
  if (capability.serviceId.toLowerCase() !== SERVICE_ID.toLowerCase()) {
    throw Object.assign(new Error("capability is for another service"), { status: 403, code: "WRONG_SERVICE" });
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (!isActive(capability, now)) throw Object.assign(new Error("capability is expired"), { status: 403, code: "EXPIRED" });
  const requester = await ccc.Address.fromString(requesterAddress, client);
  if (!cell.cellOutput.lock.eq(requester.script)) {
    throw Object.assign(new Error("requester does not control the current live capability cell"), { status: 403, code: "NOT_OWNER" });
  }
  return { cell, capability };
}

function paymentBinding({ address, outPoint, text }) {
  const normalized = JSON.stringify({
    address: String(address || ""),
    outPoint: { txHash: String(outPoint?.txHash || "").toLowerCase(), index: String(outPoint?.index ?? "") },
    text: String(text || ""),
    serviceId: SERVICE_ID,
  });
  return createHash("sha256").update(normalized).digest("hex");
}

function resourceUrl(req) {
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}/api/analyze`;
  // On Vercel prefer the platform-owned canonical host instead of any
  // request-supplied Host/X-Forwarded-Host value. This prevents host-header
  // injection from changing the resource URL bound into a payment request.
  if (IS_VERCEL) {
    const vercelHost = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
    if (/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(vercelHost)) return `https://${vercelHost}/api/analyze`;
    throw Object.assign(new Error("Vercel canonical production URL is unavailable"), { status: 503, code: "PUBLIC_URL_UNAVAILABLE" });
  }
  if (!TRUST_PROXY) return `http://127.0.0.1:${PORT}/api/analyze`;
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!/^(https?)$/.test(proto) || !/^[A-Za-z0-9.:[\]-]+$/.test(host)) throw new Error("invalid proxy host/protocol headers");
  return `${proto}://${host}/api/analyze`;
}

async function prunePaymentState() {
  await serviceState.pruneExpiredQuotes();
  await serviceState.pruneExpiredReceipts(SERVICE_RECEIPT_TTL_SECONDS * 1000);
}

async function createPaymentQuote(req, body) {
  validatePaperInput(body.text);
  await prunePaymentState();
  // Caller ownership has already been verified before this function is called.
  const invoice = await withTimeout(facilitator.invoice({
    amount: PAYMENT_AMOUNT,
    currency: PAYMENT_CURRENCY,
    description: "SkillPass paper-analyzer-v1",
    expiry: PAYMENT_TIMEOUT_SECONDS,
  }), "facilitator invoice");
  const requirement = {
    scheme: "exact",
    network: FIBER_NETWORK,
    amount: PAYMENT_AMOUNT,
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
    url: resourceUrl(req),
    description: "SkillPass protected paper analysis",
    mimeType: "application/json",
    serviceName: "SkillPass",
    tags: ["ckb", "fiber", "portable-rights", "ai"],
  };
  const required = makePaymentRequired({ resource, requirement });
  await serviceState.setQuote(String(invoice.paymentHash).toLowerCase(), {
    requirement,
    resource,
    binding: paymentBinding(body),
    expiresAt: Date.now() + PAYMENT_TIMEOUT_SECONDS * 1000,
  });
  return required;
}

async function verifyPaymentHeader(req, body) {
  const header = req.headers["payment-signature"];
  if (!header) return null;
  if (Buffer.byteLength(String(header)) > PAYMENT_HEADER_MAX_BYTES) {
    throw Object.assign(new Error("payment signature header is too large"), { status: 431, code: "PAYMENT_HEADER_TOO_LARGE" });
  }
  await prunePaymentState();
  const paymentPayload = decodeHeaderJson(String(header), "PAYMENT-SIGNATURE");
  const hash = String(paymentPayload?.payload?.paymentHash || "").toLowerCase();
  const binding = paymentBinding(body);

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
    const forwarded = String(req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim();
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
  const key = `${route}:${subject}`;
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

function validateProtectedShape(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("request body must be a JSON object"), { status: 400, code: "INVALID_BODY" });
  if (typeof body.address !== "string" || body.address.length < 8 || body.address.length > 256) throw Object.assign(new Error("address is invalid"), { status: 400, code: "INVALID_ADDRESS" });
  if (typeof body.nonce !== "string" || !/^[0-9a-f]{48}$/i.test(body.nonce)) throw Object.assign(new Error("nonce is invalid"), { status: 400, code: "INVALID_NONCE" });
  if (!body.signature || typeof body.signature !== "object" || body.signature.identity !== body.address) {
    throw Object.assign(new Error("SkillPass requires a CKB-native wallet signature bound to the connected CKB address"), { status: 401, code: "IDENTITY_NOT_BOUND" });
  }
  validatePaperInput(body.text);
  outPointFromJson(body.outPoint);
}

async function authenticateProtectedRequest(body) {
  validateProtectedShape(body);
  const challenge = await consumeChallenge(body.nonce, body.address);
  const valid = await ccc.Signer.verifyMessage(challenge.message, body.signature);
  if (!valid) throw Object.assign(new Error("wallet signature is invalid"), { status: 401, code: "INVALID_SIGNATURE" });
  return verifyLiveCapability({ outPoint: outPointFromJson(body.outPoint), requesterAddress: body.address });
}

function bearerMatches(req, expected) {
  if (!expected) return false;
  const header = String(req.headers.authorization || "");
  const value = header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
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
  return baseSecurityHeaders({
    contentType,
    csp: LIVE_CSP,
    // CCC/wallet UI is a third-party browser surface. Report Trusted Types
    // violations first; once the deployed wallet matrix is browser-tested, this
    // can be promoted to the enforced CSP without breaking compatible wallets.
    trustedTypesReportOnly: true,
  });
}
function sendJson(res, status, body, extraHeaders = {}) {
  const requestId = res.__skillpassRequestId || randomUUID();
  res.writeHead(status, { ...securityHeaders("application/json; charset=utf-8"), "cache-control": "no-store", "x-request-id": requestId, ...extraHeaders });
  res.end(JSON.stringify(body));
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
async function sendStatic(res, pathname) {
  let requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  requested = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  let file = join(PUBLIC_DIR, requested);
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { ...securityHeaders(mime[extname(file)] || "application/octet-stream"), "cache-control": requested === "index.html" ? "no-cache" : "public, max-age=300" });
    res.end(body);
    return true;
  } catch {
    if (!requested.includes(".")) {
      try {
        const body = await readFile(join(PUBLIC_DIR, "index.html"));
        res.writeHead(200, { ...securityHeaders("text/html; charset=utf-8"), "cache-control": "no-cache" });
        res.end(body); return true;
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
    service: "paper-analyzer-v1",
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
    if (req.method === "GET" && url.pathname === "/.well-known/skillpass.json") {
      return sendJson(res, 200, buildDiscovery({ deployment, serviceId: SERVICE_ID, payments: publicPaymentConfig(), maxInputChars: MAX_INPUT_CHARS }), {
        "cache-control": "public, max-age=60",
        "vercel-cdn-cache-control": "max-age=600, stale-while-revalidate=3600",
      });
    }
    if (req.method === "GET" && url.pathname === "/api/openapi.json") {
      return sendJson(res, 200, buildOpenApi({ paymentsRequired: PAYMENTS_REQUIRED, maxInputChars: MAX_INPUT_CHARS }), {
        "cache-control": "public, max-age=300",
        "vercel-cdn-cache-control": "max-age=3600, stale-while-revalidate=86400",
      });
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, {
        network: "testnet",
        deployment,
        serviceId: SERVICE_ID,
        service: "paper-analyzer-v1",
        enablePublicIssue: ENABLE_PUBLIC_ISSUE,
        limits: { maxInputChars: MAX_INPUT_CHARS },
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
        service: "paper-analyzer-v1",
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

    if (req.method === "POST" && url.pathname === "/api/challenge") {
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
      const { address } = await jsonBody(req);
      if (typeof address !== "string" || address.length < 8 || address.length > 256) {
        throw Object.assign(new Error("address is invalid"), { status: 400, code: "INVALID_ADDRESS" });
      }
      // Validate the address before spending a PostgreSQL rate-limit write.
      await ccc.Address.fromString(address, client);
      await rateLimit(req, "challenge", CHALLENGE_RATE_LIMIT, GLOBAL_CHALLENGE_RATE_LIMIT);
      return sendJson(res, 200, await issueChallenge(address));
    }

    if (req.method === "POST" && url.pathname === "/api/analyze") {
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
      const requestBody = await jsonBody(req);
      validateProtectedShape(requestBody);
      await rateLimit(req, "analyze", ANALYZE_RATE_LIMIT, GLOBAL_ANALYZE_RATE_LIMIT);

      // Authentication + live CKB ownership happen BEFORE any Fiber invoice or
      // payment verification. An unauthenticated caller cannot make the service
      // spend money on facilitator/FNN work.
      const verified = await authenticateProtectedRequest(requestBody);

      let payment = null;
      if (PAYMENTS_REQUIRED) {
        if (!req.headers["payment-signature"]) {
          const required = await createPaymentQuote(req, requestBody);
          return sendJson(res, 402, { error: "payment_required", message: "Fiber payment required; retry with a fresh wallet challenge and PAYMENT-SIGNATURE" }, { "PAYMENT-REQUIRED": encodeHeaderJson(required) });
        }
        payment = await verifyPaymentHeader(req, requestBody);
      }

      const result = payment?.alreadySettled ? payment.receipt.result : analyzePaper(requestBody.text);
      const settlement = await settlePayment(payment, result);
      const headers = settlement ? { "PAYMENT-RESPONSE": encodeHeaderJson(settlement) } : {};
      return sendJson(res, 200, { ok: true, capabilityId: verified.capability.capabilityId, result, payment: settlement }, headers);
    }

    if (url.pathname.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(req.method || "")) return sendJson(res, 405, { error: "method_not_allowed" }, { allow: "GET, HEAD, POST" });
      return sendJson(res, 404, { error: "not_found" });
    }
    if (req.method === "GET" || req.method === "HEAD") {
      if (await sendStatic(res, url.pathname)) return;
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

server.requestTimeout = 12_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 80;

server.listen(PORT, HOST, () => {
  console.log(`SkillPass live service on http://${HOST}:${PORT}`);
  console.log(`CKB network: testnet; RPC: ${process.env.CKB_RPC_URL ? "custom endpoint configured" : "CCC default endpoint"}`);
  console.log(`Capability code hash: ${deployment.codeHash}`);
  console.log(`x402/Fiber payments: ${PAYMENTS_REQUIRED ? `enabled via ${FACILITATOR_URL}` : "disabled"}`);
  console.log(`State backend: ${STATE_BACKEND}${STATE_BACKEND === "local" ? ` (${SERVICE_STATE_FILE})` : ""}`);
  console.log(`Delivery receipt retention: ${SERVICE_RECEIPT_TTL_SECONDS}s`);
  console.log("No user private key is loaded by this service.");
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`Received ${signal}; shutting down SkillPass live service`);
  await new Promise((resolve) => server.close(resolve));
  await runtimeState.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
