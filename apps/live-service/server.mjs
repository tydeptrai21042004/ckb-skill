import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
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
const MAX_BODY = 40 * 1024;
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
  ? new FacilitatorHttpClient({ baseUrl: FACILITATOR_URL, token: FACILITATOR_AUTH_TOKEN })
  : null;

if (!Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT must be 1..65535");
if (!Number.isSafeInteger(CHALLENGE_TTL_MS) || CHALLENGE_TTL_MS < 5_000 || CHALLENGE_TTL_MS > 10 * 60_000) throw new Error("CHALLENGE_TTL_MS must be 5000..600000");
if (!Number.isSafeInteger(SERVICE_RECEIPT_TTL_SECONDS) || SERVICE_RECEIPT_TTL_SECONDS < 60 || SERVICE_RECEIPT_TTL_SECONDS > 30 * 24 * 3600) {
  throw new Error("SERVICE_RECEIPT_TTL_SECONDS must be 60..2592000");
}
if (PUBLIC_BASE_URL && !/^https?:\/\//i.test(PUBLIC_BASE_URL)) throw new Error("PUBLIC_BASE_URL must start with http:// or https://");
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
  hashType: process.env.CAPABILITY_HASH_TYPE || "data1",
  depTxHash: requireHex32("CAPABILITY_DEP_TX_HASH", process.env.CAPABILITY_DEP_TX_HASH),
  depIndex: Number(process.env.CAPABILITY_DEP_INDEX || 0),
});
if (!["data", "data1", "data2", "type"].includes(deployment.hashType)) throw new Error("CAPABILITY_HASH_TYPE is invalid");
if (!Number.isSafeInteger(deployment.depIndex) || deployment.depIndex < 0) throw new Error("CAPABILITY_DEP_INDEX is invalid");

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
const READINESS_CACHE_MS = 5_000;
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

async function verifyLiveCapability({ outPoint, requesterAddress }) {
  const cell = await client.getCellLive(outPoint, true, true);
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
  // Reject obvious stale/non-owner requests before asking the user to pay.
  await verifyLiveCapability({ outPoint: outPointFromJson(body.outPoint), requesterAddress: body.address });
  const invoice = await facilitator.invoice({
    amount: PAYMENT_AMOUNT,
    currency: PAYMENT_CURRENCY,
    description: "SkillPass paper-analyzer-v1",
    expiry: PAYMENT_TIMEOUT_SECONDS,
  });
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
  const verification = await facilitator.verify({ x402Version: 2, paymentPayload, paymentRequirements: quote.requirement });
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
  const settlement = await facilitator.settle({ x402Version: 2, paymentPayload: payment.paymentPayload, paymentRequirements: payment.quote.requirement });
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
  if (TRUST_PROXY) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded.slice(0, 128);
  }
  return req.socket.remoteAddress || "unknown";
}

async function rateLimit(req, limit = 90, windowMs = 60_000) {
  const result = await rateLimiter.consume(requestKey(req), { limit, windowMs });
  if (!result.allowed) {
    throw Object.assign(new Error("rate limit exceeded"), {
      status: 429,
      code: "RATE_LIMITED",
      retryAfterSeconds: result.retryAfterSeconds,
    });
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
    tip = (await client.getTip()).toString();
    dependencies.ckb = { ok: true };
  } catch (error) {
    dependencies.ckb = { ok: false, error: "CKB RPC unavailable" };
  }

  if (PAYMENTS_REQUIRED) {
    try {
      const upstream = await facilitator.ready();
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
    const url = safeRequestUrl(req);
    if (url.pathname === "/livez") return sendJson(res, 200, { ok: true, service: "skillpass-live" });
    if (req.method === "GET" && url.pathname === "/.well-known/skillpass.json") {
      return sendJson(res, 200, buildDiscovery({ deployment, serviceId: SERVICE_ID, payments: publicPaymentConfig(), maxInputChars: MAX_INPUT_CHARS }));
    }
    if (req.method === "GET" && url.pathname === "/api/openapi.json") {
      return sendJson(res, 200, buildOpenApi({ paymentsRequired: PAYMENTS_REQUIRED, maxInputChars: MAX_INPUT_CHARS }));
    }
    if (url.pathname === "/readyz" || url.pathname === "/health" || url.pathname === "/api/status") {
      const report = await readiness();
      return sendJson(res, report.ok ? 200 : 503, report);
    }
    if (url.pathname === "/api/config") {
      return sendJson(res, 200, {
        network: "testnet",
        deployment,
        serviceId: SERVICE_ID,
        service: "paper-analyzer-v1",
        enablePublicIssue: ENABLE_PUBLIC_ISSUE,
        limits: { maxInputChars: MAX_INPUT_CHARS },
        payments: publicPaymentConfig(),
      });
    }
    if (req.method === "POST") {
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
      await rateLimit(req);
    }
    if (req.method === "POST" && url.pathname === "/api/challenge") {
      const { address } = await jsonBody(req);
      return sendJson(res, 200, await issueChallenge(address));
    }
    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const requestBody = await jsonBody(req);
      const { address, nonce, signature, outPoint, text } = requestBody;

      let payment = null;
      if (PAYMENTS_REQUIRED) {
        if (!req.headers["payment-signature"]) {
          const required = await createPaymentQuote(req, requestBody);
          return sendJson(res, 402, { error: "payment_required", message: "Fiber payment required; retry with PAYMENT-SIGNATURE" }, { "PAYMENT-REQUIRED": encodeHeaderJson(required) });
        }
        payment = await verifyPaymentHeader(req, requestBody);
      }

      const challenge = await consumeChallenge(nonce, address);
      if (!signature || signature.identity !== address) {
        throw Object.assign(new Error("SkillPass requires a CKB-native wallet whose signature identity equals the CKB address"), { status: 401, code: "IDENTITY_NOT_BOUND" });
      }
      const valid = await ccc.Signer.verifyMessage(challenge.message, signature);
      if (!valid) throw Object.assign(new Error("wallet signature is invalid"), { status: 401, code: "INVALID_SIGNATURE" });
      const verified = await verifyLiveCapability({ outPoint: outPointFromJson(outPoint), requesterAddress: address });

      // x402 authorization flow: verify -> resource -> settle -> respond.
      // Compute/validate the protected result before settlement so a handler
      // failure cannot consume the payment without producing deliverable work.
      const result = payment?.alreadySettled ? payment.receipt.result : analyzePaper(text);
      const settlement = await settlePayment(payment, result);
      const headers = settlement ? { "PAYMENT-RESPONSE": encodeHeaderJson(settlement) } : {};
      return sendJson(res, 200, { ok: true, capabilityId: verified.capability.capabilityId, result, payment: settlement }, headers);
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "not_found" });
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

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
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
