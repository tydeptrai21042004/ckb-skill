import http from "node:http";
import { join } from "node:path";
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
const NETWORK = process.env.FIBER_NETWORK === "mainnet" ? FIBER_MAINNET : FIBER_TESTNET;
const STATE_FILE = process.env.FACILITATOR_STATE_FILE || join(process.cwd(), ".runtime", "fiber-settled.json");
const ALLOW_DEV_PAYMENT = MODE === "mock" && process.env.ALLOW_DEV_PAYMENT !== "false";

const backend = MODE === "fnn"
  ? new FnnFiberBackend({ rpcUrl: process.env.FIBER_RPC_URL || "http://127.0.0.1:8227", token: process.env.FIBER_RPC_TOKEN || "" })
  : new MockFiberBackend();
const facilitator = new FiberFacilitator({ backend, network: NETWORK, replayStore: new ReplayStore({ file: STATE_FILE }) });

function securityHeaders() {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  };
}
function send(res, status, body) { res.writeHead(status, securityHeaders()); res.end(JSON.stringify(body)); }
async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, mode: MODE, network: NETWORK });
    if (req.method === "GET" && url.pathname === "/supported") return send(res, 200, facilitator.supported());
    if (req.method === "POST" && url.pathname === "/invoice") {
      const input = await body(req);
      const amount = String(input.amount || "100000");
      if (!/^[1-9][0-9]*$/.test(amount)) throw new Error("amount must be positive atomic-unit integer string");
      const created = await backend.createInvoice({ amount, currency: input.currency || (NETWORK === FIBER_MAINNET ? "Fibb" : "Fibt"), description: input.description || "SkillPass paid API", expiry: Number(input.expiry || 3600) });
      return send(res, 201, created);
    }
    if (req.method === "POST" && url.pathname === "/verify") return send(res, 200, await facilitator.verify(await body(req)));
    if (req.method === "POST" && url.pathname === "/settle") return send(res, 200, await facilitator.settle(await body(req)));
    if (req.method === "POST" && url.pathname === "/dev/pay" && ALLOW_DEV_PAYMENT) {
      const input = await body(req);
      return send(res, 200, { ok: true, invoice: await backend.markPaid(input.paymentHash, input.payer || "mock-payer") });
    }
    return send(res, 404, { error: "not_found" });
  } catch (error) {
    return send(res, error?.status || 400, { error: "bad_request", message: error?.message || "request failed" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SkillPass x402/Fiber facilitator listening on http://${HOST}:${PORT}`);
  console.log(`backend=${MODE} network=${NETWORK}`);
  if (MODE === "mock") console.log("Mock mode is for reproducible tests only. Set FIBER_BACKEND=fnn for a real local Fiber node.");
});
