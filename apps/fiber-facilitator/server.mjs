import http from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import {
  assertJsonRequest,
  assertRequestEnvelope,
  baseSecurityHeaders,
  publicErrorMessage,
  rejectCrossSiteBrowserRequest,
  safeRequestUrl,
} from "../../packages/http-security/src/index.mjs";
import {
  FIBER_TESTNET,
  FIBER_MAINNET,
  FiberFacilitator,
  FnnFiberBackend,
  MockFiberBackend,
  ReplayStore,
} from "../../packages/x402-fiber/src/index.mjs";
import {
  createPostgresPool,
  migratePostgres,
  PostgresReplayStore,
  postgresHealth,
} from "@skillpass/production-store";


function readSecret(name) {
  const file = String(process.env[`${name}_FILE`] || "").trim();
  if (file) return readFileSync(file, "utf8").trim();
  return String(process.env[name] || "").trim();
}

const HOST = process.env.FACILITATOR_HOST || "127.0.0.1";
const PORT = Number(process.env.FACILITATOR_PORT || 8790);
const MODE = process.env.FIBER_BACKEND || "mock";
const NETWORK_NAME = process.env.FIBER_NETWORK || "testnet";
const NETWORK = NETWORK_NAME === "mainnet" ? FIBER_MAINNET : FIBER_TESTNET;
const PROOF_MODE = process.env.FIBER_PAYMENT_PROOF || "invoice-status";
const STATE_FILE = process.env.FACILITATOR_STATE_FILE || join(process.cwd(), ".runtime", "fiber-settled.json");
const STATE_BACKEND = String(process.env.STATE_BACKEND || (process.env.VERCEL ? "postgres" : "local")).trim();
const ALLOW_DEV_PAYMENT = MODE === "mock" && process.env.ALLOW_DEV_PAYMENT === "true";
const AUTH_TOKEN = readSecret("FACILITATOR_AUTH_TOKEN");
const FIBER_RPC_TOKEN = readSecret("FIBER_RPC_TOKEN");
const IS_VERCEL = Boolean(process.env.VERCEL);
const IS_PUBLIC_PRODUCTION = IS_VERCEL || process.env.NODE_ENV === "production" || process.env.SKILLPASS_PUBLIC_PRODUCTION === "true";
const PAYMENTS_REQUIRED_FOR_DEPLOYMENT = process.env.PAYMENTS_REQUIRED === "true";
const MAX_BODY_BYTES = Number(process.env.FACILITATOR_MAX_REQUEST_BODY_BYTES || 32 * 1024);
const FIBER_RPC_TIMEOUT_MS = Number(process.env.FIBER_RPC_TIMEOUT_MS || 8_000);

if (!Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("FACILITATOR_PORT must be 1..65535");
if (!Number.isSafeInteger(MAX_BODY_BYTES) || MAX_BODY_BYTES < 4096 || MAX_BODY_BYTES > 64 * 1024) throw new Error("FACILITATOR_MAX_REQUEST_BODY_BYTES must be 4096..65536");
if (!Number.isSafeInteger(FIBER_RPC_TIMEOUT_MS) || FIBER_RPC_TIMEOUT_MS < 1000 || FIBER_RPC_TIMEOUT_MS > 15_000) throw new Error("FIBER_RPC_TIMEOUT_MS must be 1000..15000");
if (!["mock", "fnn"].includes(MODE)) throw new Error("FIBER_BACKEND must be mock or fnn");
if (!["testnet", "mainnet"].includes(NETWORK_NAME)) throw new Error("FIBER_NETWORK must be testnet or mainnet");
if (!["invoice-status", "preimage"].includes(PROOF_MODE)) throw new Error("FIBER_PAYMENT_PROOF must be invoice-status or preimage");
if (MODE === "fnn" && !AUTH_TOKEN) throw new Error("FACILITATOR_AUTH_TOKEN is required when FIBER_BACKEND=fnn");
if (IS_PUBLIC_PRODUCTION && AUTH_TOKEN.length < 32) throw new Error("FACILITATOR_AUTH_TOKEN must be at least 32 characters in public production");
if (IS_PUBLIC_PRODUCTION && ALLOW_DEV_PAYMENT) throw new Error("ALLOW_DEV_PAYMENT=true is forbidden in public production");
if (IS_PUBLIC_PRODUCTION && PAYMENTS_REQUIRED_FOR_DEPLOYMENT && MODE !== "fnn") throw new Error("FIBER_BACKEND=fnn is required when public production payments are enabled");
if (IS_PUBLIC_PRODUCTION && STATE_BACKEND === "local") throw new Error("STATE_BACKEND=local is forbidden in public production; use postgres");

if (MODE === "fnn") {
  const rpc = new URL(process.env.FIBER_RPC_URL || "http://127.0.0.1:8227");
  if (!["http:", "https:"].includes(rpc.protocol)) throw new Error("FIBER_RPC_URL must use http:// or https://");
  if (IS_PUBLIC_PRODUCTION && rpc.protocol !== "https:") throw new Error("FIBER_RPC_URL must use https:// in public production");
  if (IS_VERCEL && /^(localhost|127\.0\.0\.1|::1)$/i.test(rpc.hostname)) throw new Error("FIBER_RPC_URL cannot point to localhost from Vercel");
}

const backend = MODE === "fnn"
  ? new FnnFiberBackend({ rpcUrl: process.env.FIBER_RPC_URL, token: FIBER_RPC_TOKEN, timeoutMs: FIBER_RPC_TIMEOUT_MS })
  : new MockFiberBackend();

let postgresPool = null;
let replayStore;
if (STATE_BACKEND === "local") {
  replayStore = new ReplayStore({ file: STATE_FILE });
} else if (STATE_BACKEND === "postgres" || STATE_BACKEND === "postgres-redis") {
  postgresPool = createPostgresPool();
  await migratePostgres(postgresPool);
  replayStore = new PostgresReplayStore({ pool: postgresPool });
} else {
  throw new Error("STATE_BACKEND must be local, postgres, or postgres-redis");
}

const facilitator = new FiberFacilitator({
  backend,
  network: NETWORK,
  proofMode: PROOF_MODE,
  replayStore,
});

const FACILITATOR_CSP = "default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
function securityHeaders() {
  return {
    ...baseSecurityHeaders({ contentType: "application/json; charset=utf-8", csp: FACILITATOR_CSP }),
    "cache-control": "no-store",
  };
}
function send(res, status, body) {
  res.writeHead(status, { ...securityHeaders(), "x-request-id": res.__skillpassRequestId || randomUUID() });
  res.end(JSON.stringify(body));
}
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("body too large"), { status: 413, code: "BODY_TOO_LARGE" });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("request body must be valid JSON"), { status: 400, code: "INVALID_JSON" }); }
}
function sameSecret(provided, expected) {
  const left = Buffer.from(String(provided || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
function requireAuth(req) {
  if (!AUTH_TOKEN) return;
  const header = String(req.headers.authorization || "");
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!sameSecret(provided, AUTH_TOKEN)) {
    throw Object.assign(new Error("facilitator authentication required"), { status: 401, code: "AUTH_REQUIRED" });
  }
}

const server = http.createServer(async (req, res) => {
  res.__skillpassRequestId = randomUUID();
  try {
    assertRequestEnvelope(req);
    const url = safeRequestUrl(req);

    if (req.method === "GET" && url.pathname === "/livez") return send(res, 200, { ok: true, service: "skillpass-facilitator" });
    if (req.method === "GET" && url.pathname === "/health") {
      // Public health is deliberately shallow: it must not let an attacker turn
      // health polling into FNN or database work.
      return send(res, 200, { ok: true, service: "skillpass-facilitator", mode: MODE, network: NETWORK });
    }
    if (req.method === "GET" && url.pathname === "/supported") return send(res, 200, facilitator.supported());

    if (req.method === "GET" && url.pathname === "/readyz") {
      requireAuth(req);
      const upstream = await backend.health();
      const version = upstream?.node?.version ?? upstream?.version;
      const state = postgresPool ? await postgresHealth(postgresPool) : { ok: true, skipped: true };
      const ok = Boolean(upstream?.ok) && Boolean(state.ok);
      return send(res, ok ? 200 : 503, {
        ok,
        mode: MODE,
        network: NETWORK,
        paymentProof: PROOF_MODE,
        state: { backend: STATE_BACKEND, postgres: state },
        upstream: { ok: Boolean(upstream?.ok), backend: upstream?.backend || MODE, ...(version ? { version: String(version).slice(0, 80) } : {}) },
      });
    }

    const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "");
    if (mutating) {
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
    }

    // Unknown routes are rejected before JSON parsing or Fiber/database work.
    const allowedPost = new Set(["/invoice", "/verify", "/settle", "/dev/pay"]);
    if (req.method === "POST" && !allowedPost.has(url.pathname)) return send(res, 404, { error: "not_found" });

    requireAuth(req);
    if (req.method === "POST" && url.pathname === "/invoice") {
      const input = await body(req);
      const amount = String(input.amount || "100000");
      if (!/^[1-9][0-9]{0,31}$/.test(amount)) throw Object.assign(new Error("amount must be a positive atomic-unit integer string with at most 32 digits"), { code: "INVALID_AMOUNT" });
      const expiry = Number(input.expiry ?? 3600);
      if (!Number.isSafeInteger(expiry) || expiry < 1 || expiry > 3600) throw Object.assign(new Error("expiry must be 1..3600 seconds"), { code: "INVALID_EXPIRY" });
      const currency = String(input.currency || (NETWORK === FIBER_MAINNET ? "Fibb" : "Fibt")).trim();
      const description = String(input.description || "SkillPass paid API").trim();
      if (!currency || currency.length > 32) throw Object.assign(new Error("currency must be 1..32 characters"), { code: "INVALID_CURRENCY" });
      if (!description || description.length > 256) throw Object.assign(new Error("description must be 1..256 characters"), { code: "INVALID_DESCRIPTION" });
      const created = await backend.createInvoice({ amount, currency, description, expiry });
      return send(res, 201, created);
    }
    if (req.method === "POST" && url.pathname === "/verify") return send(res, 200, await facilitator.verify(await body(req)));
    if (req.method === "POST" && url.pathname === "/settle") return send(res, 200, await facilitator.settle(await body(req)));
    if (req.method === "POST" && url.pathname === "/dev/pay" && ALLOW_DEV_PAYMENT) {
      const input = await body(req);
      if (typeof input.paymentHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(input.paymentHash)) {
        throw Object.assign(new Error("paymentHash must be 32-byte hex"), { code: "INVALID_PAYMENT_HASH" });
      }
      const invoice = await backend.markPaid(input.paymentHash, String(input.payer || "mock-payer").slice(0, 128));
      return send(res, 200, {
        ok: true,
        invoice: {
          paymentHash: invoice.paymentHash,
          paymentPreimage: invoice.paymentPreimage,
          status: invoice.status,
          payer: invoice.payer,
          paidAt: invoice.paidAt,
        },
      });
    }
    return send(res, 404, { error: "not_found" });
  } catch (error) {
    const status = error?.status || (error?.name === "FiberRpcError" ? 503 : 400);
    const code = error?.code || (status === 503 ? "UPSTREAM_UNAVAILABLE" : status === 401 ? "AUTH_REQUIRED" : "BAD_REQUEST");
    const message = status >= 500 ? "upstream service temporarily unavailable" : publicErrorMessage(error);
    return send(res, status, { error: code.toLowerCase(), code, message });
  }
});

server.requestTimeout = 12_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 80;

export { server };

export function startServer() {
  if (server.listening) return server;
  server.listen(PORT, HOST, () => {
  console.log(`SkillPass x402/Fiber facilitator listening on http://${HOST}:${PORT}`);
  console.log(`backend=${MODE} network=${NETWORK} paymentProof=${PROOF_MODE} state=${STATE_BACKEND}`);
  if (AUTH_TOKEN) console.log("facilitator API authentication: enabled");
  if (MODE === "mock") console.log(`Mock mode is for reproducible tests only. Dev pay endpoint: ${ALLOW_DEV_PAYMENT ? "enabled" : "disabled"}.`);
});
  return server;
}


let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`Received ${signal}; shutting down SkillPass facilitator`);
  await new Promise((resolve) => server.close(resolve));
  if (postgresPool) await postgresPool.end();
  process.exit(0);
}



if (!process.env.VERCEL) {
  startServer();
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
