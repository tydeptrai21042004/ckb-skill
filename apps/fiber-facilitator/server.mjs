import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import {
  assertJsonRequest,
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

const HOST = process.env.FACILITATOR_HOST || "127.0.0.1";
const PORT = Number(process.env.FACILITATOR_PORT || 8790);
const MODE = process.env.FIBER_BACKEND || "mock";
const NETWORK_NAME = process.env.FIBER_NETWORK || "testnet";
const NETWORK = NETWORK_NAME === "mainnet" ? FIBER_MAINNET : FIBER_TESTNET;
const PROOF_MODE = process.env.FIBER_PAYMENT_PROOF || "invoice-status";
const STATE_FILE = process.env.FACILITATOR_STATE_FILE || join(process.cwd(), ".runtime", "fiber-settled.json");
const ALLOW_DEV_PAYMENT = MODE === "mock" && process.env.ALLOW_DEV_PAYMENT === "true";
const AUTH_TOKEN = process.env.FACILITATOR_AUTH_TOKEN || "";

if (!Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("FACILITATOR_PORT must be 1..65535");
if (!["mock", "fnn"].includes(MODE)) throw new Error("FIBER_BACKEND must be mock or fnn");
if (!["testnet", "mainnet"].includes(NETWORK_NAME)) throw new Error("FIBER_NETWORK must be testnet or mainnet");
if (!["invoice-status", "preimage"].includes(PROOF_MODE)) throw new Error("FIBER_PAYMENT_PROOF must be invoice-status or preimage");
if (MODE === "fnn" && !AUTH_TOKEN) throw new Error("FACILITATOR_AUTH_TOKEN is required when FIBER_BACKEND=fnn");

const backend = MODE === "fnn"
  ? new FnnFiberBackend({ rpcUrl: process.env.FIBER_RPC_URL || "http://127.0.0.1:8227", token: process.env.FIBER_RPC_TOKEN || "" })
  : new MockFiberBackend();
const facilitator = new FiberFacilitator({
  backend,
  network: NETWORK,
  proofMode: PROOF_MODE,
  replayStore: new ReplayStore({ file: STATE_FILE }),
});

const FACILITATOR_CSP = "default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
function securityHeaders() {
  return {
    ...baseSecurityHeaders({ contentType: "application/json; charset=utf-8", csp: FACILITATOR_CSP }),
    "cache-control": "no-store",
  };
}
function send(res, status, body) { res.writeHead(status, securityHeaders()); res.end(JSON.stringify(body)); }
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error("body too large"), { status: 413, code: "BODY_TOO_LARGE" });
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
  try {
    const url = safeRequestUrl(req);
    if (req.method === "GET" && url.pathname === "/livez") return send(res, 200, { ok: true, service: "skillpass-facilitator" });
    if (req.method === "GET" && (url.pathname === "/readyz" || url.pathname === "/health")) {
      const upstream = await backend.health();
      const version = upstream?.node?.version ?? upstream?.version;
      return send(res, 200, {
        ok: true,
        mode: MODE,
        network: NETWORK,
        paymentProof: PROOF_MODE,
        upstream: { ok: Boolean(upstream?.ok), backend: upstream?.backend || MODE, ...(version ? { version: String(version).slice(0, 80) } : {}) },
      });
    }
    // Capabilities are intentionally discoverable; mutating/verification APIs
    // remain protected when a facilitator token is configured.
    if (req.method === "GET" && url.pathname === "/supported") return send(res, 200, facilitator.supported());

    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
      rejectCrossSiteBrowserRequest(req);
      assertJsonRequest(req);
    }
    requireAuth(req);
    if (req.method === "POST" && url.pathname === "/invoice") {
      const input = await body(req);
      const amount = String(input.amount || "100000");
      if (!/^[1-9][0-9]*$/.test(amount)) throw Object.assign(new Error("amount must be positive atomic-unit integer string"), { code: "INVALID_AMOUNT" });
      const expiry = Number(input.expiry ?? 3600);
      if (!Number.isSafeInteger(expiry) || expiry < 1 || expiry > 3600) throw Object.assign(new Error("expiry must be 1..3600 seconds"), { code: "INVALID_EXPIRY" });
      const currency = String(input.currency || (NETWORK === FIBER_MAINNET ? "Fibb" : "Fibt")).trim();
      const description = String(input.description || "SkillPass paid API").trim();
      if (!currency || currency.length > 32) throw Object.assign(new Error("currency must be 1..32 characters"), { code: "INVALID_CURRENCY" });
      if (!description || description.length > 512) throw Object.assign(new Error("description must be 1..512 characters"), { code: "INVALID_DESCRIPTION" });
      const created = await backend.createInvoice({ amount, currency, description, expiry });
      return send(res, 201, created);
    }
    if (req.method === "POST" && url.pathname === "/verify") return send(res, 200, await facilitator.verify(await body(req)));
    if (req.method === "POST" && url.pathname === "/settle") return send(res, 200, await facilitator.settle(await body(req)));
    if (req.method === "POST" && url.pathname === "/dev/pay" && ALLOW_DEV_PAYMENT) {
      const input = await body(req);
      const invoice = await backend.markPaid(input.paymentHash, input.payer || "mock-payer");
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
    return send(res, status, { error: code.toLowerCase(), code, message: publicErrorMessage(error) });
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 80;

server.listen(PORT, HOST, () => {
  console.log(`SkillPass x402/Fiber facilitator listening on http://${HOST}:${PORT}`);
  console.log(`backend=${MODE} network=${NETWORK} paymentProof=${PROOF_MODE}`);
  if (AUTH_TOKEN) console.log("facilitator API authentication: enabled");
  if (MODE === "mock") console.log(`Mock mode is for reproducible tests only. Dev pay endpoint: ${ALLOW_DEV_PAYMENT ? "enabled" : "disabled"}.`);
});
