import http from "node:http";
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

function send(res, status, body) {
  res.writeHead(status, baseHeaders("application/json; charset=utf-8"));
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
    if (req.method === "POST" && url.pathname === "/api/demo/reset") {
      runtime = createDemoRuntime();
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
