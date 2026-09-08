import test from "node:test";
import assert from "node:assert/strict";
import { discoverSkillPass, resolveService, buildSignedInvocation, invokeSkillPass } from "../src/index.mjs";

function response(status, body, headers = {}) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), headers: { get: (name) => headers[name.toLowerCase()] || null } };
}

test("agent SDK discovers and selects a service", async () => {
  const fetchImpl = async () => response(200, { services: [{ slug: "research-insights-v1", id: `0x${"11".repeat(32)}` }] });
  const discovery = await discoverSkillPass("https://skill.example/", { fetchImpl });
  assert.equal(resolveService(discovery, "research-insights-v1").slug, "research-insights-v1");
});

test("agent SDK challenge binds service, request hash and delegation id", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return response(200, { nonce: "ab".repeat(24), message: "challenge-message", expiresAt: Date.now() + 60000 });
  };
  const signer = { getRecommendedAddress: async () => "ckt1-agent-address", signMessage: async (message) => ({ identity: "ckt1-agent-address", signature: `signed:${message}` }) };
  const delegation = { grant: { grantId: "12".repeat(16) }, ownerSignature: {} };
  const signed = await buildSignedInvocation({
    baseUrl: "https://skill.example",
    signer,
    outPoint: { txHash: `0x${"22".repeat(32)}`, index: "0" },
    service: { slug: "research-insights-v1", id: `0x${"11".repeat(32)}`, endpoint: "/api/invoke/research-insights-v1", inputKind: "json" },
    input: { b: 2, a: 1 },
    delegation,
    fetchImpl,
  });
  const challengeBody = JSON.parse(calls[0].init.body);
  assert.equal(challengeBody.service, "research-insights-v1");
  assert.equal(challengeBody.delegationId, "12".repeat(16));
  assert.match(challengeBody.requestHash, /^[0-9a-f]{64}$/);
  assert.equal(signed.body.delegation, delegation);
});

test("agent SDK surfaces x402 payment requirement instead of hiding it", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return response(200, { nonce: "ab".repeat(24), message: "challenge", expiresAt: Date.now() + 60000 });
    return response(402, { error: "payment_required" }, { "payment-required": "base64-requirement" });
  };
  const signer = { getRecommendedAddress: async () => "ckt1-agent-address", signMessage: async () => ({ identity: "ckt1-agent-address", signature: "sig" }) };
  const result = await invokeSkillPass({
    baseUrl: "https://skill.example",
    signer,
    outPoint: { txHash: `0x${"22".repeat(32)}`, index: "0" },
    service: { slug: "svc", id: `0x${"11".repeat(32)}`, endpoint: "/api/invoke/svc", inputKind: "text" },
    input: "hello",
    fetchImpl,
  });
  assert.equal(result.paymentRequired, true);
  assert.equal(result.requirement, "base64-requirement");
});

test("agent SDK paid helper obtains a fresh challenge before retrying with payment", async () => {
  let challengeCount = 0;
  const calls = [];
  const signer = {
    async getRecommendedAddress() { return "ckt1agent-address"; },
    async signMessage(message) { return { identity: "ckt1agent-address", signature: `sig:${message.length}` }; },
  };
  const service = { slug: "paper-analyzer-v1", inputKind: "text", endpoint: "/api/invoke/paper-analyzer-v1" };
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/api/challenge")) {
      challengeCount += 1;
      return new Response(JSON.stringify({ nonce: `nonce-${challengeCount}`, message: `challenge-${challengeCount}`, expiresAt: Date.now() + 60000 }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("/api/invoke/")) {
      if (!init.headers?.["payment-signature"]) {
        return new Response(JSON.stringify({ error: "payment_required" }), { status: 402, headers: { "content-type": "application/json", "payment-required": "encoded-requirement" } });
      }
      return new Response(JSON.stringify({ ok: true, result: { words: 3 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const { invokeSkillPassWithPayment } = await import("../src/index.mjs");
  const result = await invokeSkillPassWithPayment({
    baseUrl: "https://skill.example",
    signer,
    outPoint: { txHash: `0x${"11".repeat(32)}`, index: "0" },
    service,
    input: "hello agent world",
    fetchImpl,
    paymentAdapter: { async createPaymentSignature() { return "paid-header"; } },
  });
  assert.equal(result.ok, true);
  assert.equal(result.paidRetry, true);
  assert.equal(challengeCount, 2);
  assert.equal(calls.filter((item) => String(item.url).endsWith("/api/challenge")).length, 2);
});
