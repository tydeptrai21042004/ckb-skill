import http from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FLAG_TRANSFERABLE, encodeCapabilityHex } from "../../packages/capability-codec/src/index.mjs";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "../../packages/capability-codec/src/service-ids.mjs";
import { randomId32 } from "../../packages/capability-codec/src/node-ids.mjs";
import { InMemoryChain } from "../../packages/verifier/src/in-memory-chain.mjs";
import { CapabilityVerifier } from "../../packages/verifier/src/verifier.mjs";
import { ChallengeStore } from "../../packages/verifier/src/challenge-store.mjs";
import { TestProofVerifier, TestWallet } from "../../packages/verifier/src/mock-wallet.mjs";
import { SkillPassService } from "./src/service.mjs";
import {
  FIBER_TESTNET,
  FiberFacilitator,
  MockFiberBackend,
  ReplayStore,
  decodeHeaderJson,
  encodeHeaderJson,
  makePaymentPayload,
  makePaymentRequired,
} from "../../packages/x402-fiber/src/index.mjs";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const SERVICE_ID = PAPER_ANALYZER_V1_SERVICE_ID;
const ISSUER = `0x${"11".repeat(32)}`;
const ALICE_LOCK = `0x${"aa".repeat(32)}`;
const BOB_LOCK = `0x${"bb".repeat(32)}`;
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");

const alice = new TestWallet({ identity: "alice", lockHash: ALICE_LOCK, secret: "alice-local-demo-secret" });
const bob = new TestWallet({ identity: "bob", lockHash: BOB_LOCK, secret: "bob-local-demo-secret" });
const proofVerifier = new TestProofVerifier([alice, bob]);
const wallets = new Map([["alice", alice], ["bob", bob]]);

function createDemoRuntime() {
  const chain = new InMemoryChain();
  const issued = chain.issue({
    ownerLockHash: ALICE_LOCK,
    issuerInputLockHash: ISSUER,
    data: encodeCapabilityHex({
      version: 1,
      flags: FLAG_TRANSFERABLE,
      serviceId: SERVICE_ID,
      issuerId: ISSUER,
      capabilityId: randomId32(),
      expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    }),
  });
  const capabilityVerifier = new CapabilityVerifier({ chain, expectedServiceId: SERVICE_ID });
  const challengeStore = new ChallengeStore({ ttlMs: 60_000 });
  const service = new SkillPassService({
    challengeStore,
    proofVerifier,
    capabilityVerifier,
    lockHashResolver: (identity) => proofVerifier.lockHashFor(identity),
  });
  return { chain, issued, service };
}

let runtime = createDemoRuntime();
function createPaymentRuntime() {
  const backend = new MockFiberBackend();
  const facilitator = new FiberFacilitator({ backend, replayStore: new ReplayStore(), network: FIBER_TESTNET });
  const quotes = new Map();
  return { backend, facilitator, quotes };
}
let payments = createPaymentRuntime();
const rate = new Map();

function clientKey(req) {
  return req.socket.remoteAddress || "unknown";
}

function rateLimit(req, limit = 120, windowMs = 60_000) {
  const key = clientKey(req);
  const now = Date.now();
  const current = rate.get(key);
  if (!current || now >= current.resetAt) {
    rate.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    const error = new Error("too many demo requests; retry shortly");
    error.code = "RATE_LIMITED";
    error.status = 429;
    throw error;
  }
}

async function jsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 32 * 1024) {
      const error = new Error("request body too large");
      error.code = "BODY_TOO_LARGE";
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function baseHeaders(contentType) {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
  };
}

function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { ...baseHeaders("application/json; charset=utf-8"), ...extraHeaders });
  res.end(JSON.stringify(body));
}

async function staticFile(res, name, contentType) {
  const data = await readFile(join(PUBLIC_DIR, name));
  res.writeHead(200, { ...baseHeaders(contentType), "cache-control": "public, max-age=300" });
  res.end(data);
}

function demoState() {
  const aliceCells = runtime.chain.findByOwner(ALICE_LOCK);
  const bobCells = runtime.chain.findByOwner(BOB_LOCK);
  const live = aliceCells[0] || bobCells[0];
  return {
    mode: "local-test-only",
    service: "paper-analyzer-v1",
    network: "simulated-local-chain",
    currentOwner: aliceCells.length ? "alice" : bobCells.length ? "bob" : "none",
    currentOutPoint: live?.outPoint ?? null,
    aliceCells: aliceCells.map((c) => c.outPoint),
    bobCells: bobCells.map((c) => c.outPoint),
    initialOutPoint: runtime.issued.outPoint,
    warning: "This UI demonstrates the protocol locally. It never represents testnet evidence.",
  };
}

function useAs(identity, outPoint, text) {
  const wallet = wallets.get(identity);
  if (!wallet) throw new Error("demo identity must be alice or bob");
  const challenge = runtime.service.challenge(wallet.identity);
  return runtime.service.analyze({
    identity: wallet.identity,
    nonce: challenge.nonce,
    proof: wallet.sign(challenge.message),
    outPoint,
    text,
  });
}

async function newPaymentQuote(req, requestBody) {
  const origin = `http://${req.headers.host || `127.0.0.1:${PORT}`}`;
  const created = await payments.backend.createInvoice({ amount: "100000", currency: "Fibt", description: "SkillPass paid paper analysis" });
  const requestBinding = createHash("sha256").update(JSON.stringify({ identity: requestBody?.identity, outPoint: requestBody?.outPoint })).digest("hex");
  const requirement = {
    scheme: "exact",
    network: FIBER_TESTNET,
    amount: created.amount,
    asset: "CKB",
    payTo: "skillpass-demo-provider",
    maxTimeoutSeconds: 60,
    extra: {
      assetTransferMethod: "fiber-invoice",
      paymentFlow: "authorization",
      invoice: created.invoice,
      paymentHash: created.paymentHash,
      requestBinding: `sha256:${requestBinding}`,
    },
  };
  const resource = {
    url: `${origin}/api/demo/paid-use`,
    description: "SkillPass capability-authorized paid paper analysis",
    mimeType: "application/json",
    serviceName: "SkillPass Research",
    tags: ["ckb", "fiber", "research"],
  };
  const required = makePaymentRequired({ resource, requirement });
  payments.quotes.set(created.paymentHash.toLowerCase(), { requirement, resource, createdAt: Date.now(), identity: requestBody?.identity, outPoint: requestBody?.outPoint });
  return { required, requirement, resource, created };
}

function prunePaymentQuotes() {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [key, quote] of payments.quotes) if (quote.createdAt < cutoff) payments.quotes.delete(key);
  while (payments.quotes.size > 2_000) payments.quotes.delete(payments.quotes.keys().next().value);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") return staticFile(res, "index.html", "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/app.js") return staticFile(res, "app.js", "text/javascript; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/styles.css") return staticFile(res, "styles.css", "text/css; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, mode: "local-test-only", service: "paper-analyzer-v1" });
    }
    if (req.method === "GET" && ["/demo-state", "/api/demo/state"].includes(url.pathname)) {
      return send(res, 200, demoState());
    }

    if (req.method === "POST") rateLimit(req);

    // Low-level auth endpoints kept for deterministic tests and API study.
    if (req.method === "POST" && url.pathname === "/challenge") {
      const { identity } = await jsonBody(req);
      return send(res, 200, runtime.service.challenge(identity));
    }
    if (req.method === "POST" && url.pathname === "/analyze") {
      const payload = await jsonBody(req);
      return send(res, 200, runtime.service.analyze(payload));
    }

    // Convenience routes for the LOCAL demo UI. The test wallets exist only
    // inside this simulation and must never be copied into a live deployment.
    if (req.method === "POST" && url.pathname === "/api/demo/use") {
      const { identity, outPoint, text } = await jsonBody(req);
      const result = useAs(identity, outPoint, text || "Method. SkillPass checks live ownership. Result. Access follows the current Capability Cell. Conclusion.");
      return send(res, 200, { ok: true, result });
    }
    if (req.method === "POST" && ["/demo-transfer", "/api/demo/transfer"].includes(url.pathname)) {
      const { from = "alice", to = "bob", outPoint } = await jsonBody(req);
      const sourceOutPoint = outPoint || demoState().currentOutPoint;
      if (!sourceOutPoint) throw new Error("no live capability exists");
      const fromLock = proofVerifier.lockHashFor(from);
      const toLock = proofVerifier.lockHashFor(to);
      const successor = runtime.chain.transfer({ outPoint: sourceOutPoint, signerLockHash: fromLock, recipientLockHash: toLock });
      return send(res, 200, { ok: true, successorOutPoint: successor.outPoint, state: demoState() });
    }
    // Combined research path: portable CKB right + x402-v2-style Fiber payment.
    if (req.method === "POST" && url.pathname === "/api/demo/paid-use") {
      prunePaymentQuotes();
      const requestBody = await jsonBody(req);
      const signatureHeader = req.headers["payment-signature"];
      if (!signatureHeader) {
        const quote = await newPaymentQuote(req, requestBody);
        return send(res, 402, quote.required, { "payment-required": encodeHeaderJson(quote.required) });
      }
      const payload = decodeHeaderJson(String(signatureHeader), "PAYMENT-SIGNATURE");
      const hash = String(payload?.payload?.paymentHash || "").toLowerCase();
      const quote = payments.quotes.get(hash);
      if (!quote) return send(res, 402, { error: "PAYMENT_QUOTE_UNKNOWN", message: "payment quote is missing or expired; request a fresh 402" });
      if (quote.identity !== requestBody.identity || JSON.stringify(quote.outPoint) !== JSON.stringify(requestBody.outPoint)) {
        return send(res, 402, { error: "PAYMENT_REQUEST_BINDING_MISMATCH", message: "payment quote was issued for a different requester/capability" });
      }
      const verification = await payments.facilitator.verify({ x402Version: 2, paymentPayload: payload, paymentRequirements: quote.requirement });
      if (!verification.isValid) return send(res, 402, { error: verification.invalidReason, message: "Fiber payment has not been verified" }, { "payment-required": encodeHeaderJson(makePaymentRequired({ resource: quote.resource, requirement: quote.requirement, error: verification.invalidReason })) });
      const { identity, outPoint, text } = requestBody;
      // Authorization remains CKB-capability based. Payment alone never grants service access.
      const result = useAs(identity, outPoint, text || "Method. SkillPass checks live ownership and payment. Result. Access follows the current Capability Cell. Conclusion.");
      const settlement = await payments.facilitator.settle({ x402Version: 2, paymentPayload: payload, paymentRequirements: quote.requirement });
      if (!settlement.success) throw Object.assign(new Error(settlement.errorReason || "payment settlement failed"), { status: 402, code: settlement.errorReason || "PAYMENT_SETTLEMENT_FAILED" });
      payments.quotes.delete(hash);
      return send(res, 200, { ok: true, result, payment: settlement }, { "payment-response": encodeHeaderJson(settlement) });
    }
    if (req.method === "POST" && url.pathname === "/api/demo/pay") {
      const { paymentHash, payer = "demo-agent" } = await jsonBody(req);
      return send(res, 200, { ok: true, invoice: await payments.backend.markPaid(paymentHash, payer) });
    }
    if (req.method === "POST" && url.pathname === "/api/demo/payment-payload") {
      const { paymentHash, payer = "demo-agent" } = await jsonBody(req);
      const quote = payments.quotes.get(String(paymentHash || "").toLowerCase());
      if (!quote) throw new Error("unknown payment quote");
      return send(res, 200, { paymentPayload: makePaymentPayload({ resource: quote.resource, requirement: quote.requirement, payer }) });
    }
    if (req.method === "POST" && url.pathname === "/api/demo/reset") {
      runtime = createDemoRuntime();
      payments = createPaymentRuntime();
      return send(res, 200, { ok: true, state: demoState() });
    }

    return send(res, 404, { error: "not_found" });
  } catch (error) {
    const status = error?.status || (error?.name === "AccessDeniedError" ? 403 : error?.name === "AuthenticationError" ? 401 : 400);
    return send(res, status, { error: error.code || "bad_request", message: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SkillPass local demo listening on http://${HOST}:${PORT}`);
  console.log(`Open http://127.0.0.1:${PORT}/ for the interactive two-user demo.`);
  console.log("LOCAL TEST MODE ONLY — no real wallet keys or CKB testnet state are used here.");
});
