import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
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
import { analyzePaper } from "../demo-service/src/paper-analyzer.mjs";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_DIR = process.env.PUBLIC_DIR || join(dirname(fileURLToPath(import.meta.url)), "public");
const SERVICE_ID = PAPER_ANALYZER_V1_SERVICE_ID;
const MAX_BODY = 40 * 1024;
const CHALLENGE_TTL_MS = 60_000;
const ENABLE_PUBLIC_ISSUE = process.env.ENABLE_PUBLIC_ISSUE === "true";

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

const challenges = new Map();
const rate = new Map();

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

function pruneChallenges() {
  const now = Date.now();
  for (const [nonce, item] of challenges) {
    if (now > item.expiresAt + CHALLENGE_TTL_MS) challenges.delete(nonce);
  }
  while (challenges.size > 10_000) challenges.delete(challenges.keys().next().value);
}

async function issueChallenge(address) {
  pruneChallenges();
  await ccc.Address.fromString(address, client); // also enforces testnet prefix
  const nonce = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const message = challengeMessage({ nonce, address, expiresAt });
  challenges.set(nonce, { address, expiresAt, message, used: false });
  return { nonce, expiresAt, message };
}

function consumeChallenge(nonce, address) {
  const item = challenges.get(nonce);
  if (!item) throw Object.assign(new Error("challenge nonce not found"), { status: 401, code: "UNKNOWN_NONCE" });
  if (item.used) throw Object.assign(new Error("challenge nonce already used"), { status: 401, code: "REPLAY" });
  item.used = true;
  if (Date.now() >= item.expiresAt) throw Object.assign(new Error("challenge expired"), { status: 401, code: "EXPIRED_NONCE" });
  if (item.address !== address) throw Object.assign(new Error("challenge address mismatch"), { status: 401, code: "ADDRESS_MISMATCH" });
  return item;
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

function requestKey(req) { return req.socket.remoteAddress || "unknown"; }
function rateLimit(req, limit = 90, windowMs = 60_000) {
  const key = requestKey(req); const now = Date.now(); const current = rate.get(key);
  if (!current || now >= current.resetAt) { rate.set(key, { count: 1, resetAt: now + windowMs }); return; }
  current.count += 1;
  if (current.count > limit) throw Object.assign(new Error("rate limit exceeded"), { status: 429, code: "RATE_LIMITED" });
}

async function jsonBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("request body too large"), { status: 413, code: "BODY_TOO_LARGE" });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function securityHeaders(contentType) {
  return {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://*.ckb.dev https://*.ckbapp.dev wss://*.ckb.dev wss://*.ckbapp.dev; img-src 'self' data: https:; font-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
  };
}
function sendJson(res, status, body) {
  res.writeHead(status, { ...securityHeaders("application/json; charset=utf-8"), "cache-control": "no-store" });
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      const tip = await client.getTip();
      return sendJson(res, 200, { ok: true, mode: "ckb-testnet", tip: tip.toString(), service: "paper-analyzer-v1" });
    }
    if (url.pathname === "/api/config") {
      return sendJson(res, 200, { network: "testnet", deployment, serviceId: SERVICE_ID, service: "paper-analyzer-v1", enablePublicIssue: ENABLE_PUBLIC_ISSUE });
    }
    if (req.method === "POST") rateLimit(req);
    if (req.method === "POST" && url.pathname === "/api/challenge") {
      const { address } = await jsonBody(req);
      return sendJson(res, 200, await issueChallenge(address));
    }
    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const { address, nonce, signature, outPoint, text } = await jsonBody(req);
      const challenge = consumeChallenge(nonce, address);
      if (!signature || signature.identity !== address) {
        throw Object.assign(new Error("MVP requires a CKB-native wallet whose signature identity equals the CKB address"), { status: 401, code: "IDENTITY_NOT_BOUND" });
      }
      const valid = await ccc.Signer.verifyMessage(challenge.message, signature);
      if (!valid) throw Object.assign(new Error("wallet signature is invalid"), { status: 401, code: "INVALID_SIGNATURE" });
      const verified = await verifyLiveCapability({ outPoint: outPointFromJson(outPoint), requesterAddress: address });
      const result = analyzePaper(text);
      return sendJson(res, 200, { ok: true, capabilityId: verified.capability.capabilityId, result });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "not_found" });
    if (req.method === "GET" || req.method === "HEAD") {
      if (await sendStatic(res, url.pathname)) return;
    }
    return sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    const status = error?.status || 400;
    return sendJson(res, status, { error: error?.code || "bad_request", message: error?.message || "request failed" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SkillPass live service on http://${HOST}:${PORT}`);
  console.log(`CKB network: testnet; RPC: ${client.url}`);
  console.log(`Capability code hash: ${deployment.codeHash}`);
  console.log("No user private key is loaded by this service.");
});
