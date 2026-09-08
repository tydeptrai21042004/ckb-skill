import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("Week 9 issuance separates provider signer from recipient owner", () => {
  const src = read("packages/ckb-client/src/live.ts");
  assert.match(src, /recipientAddress:\s*string/);
  assert.match(src, /const issuerAddress = await params\.signer\.getRecommendedAddressObj\(\)/);
  assert.match(src, /ccc\.Address\.fromString\(params\.recipientAddress\.trim\(\), params\.signer\.client\)/);
  assert.match(src, /outputs:\s*\[\{ lock: ownerLock, type: placeholderType \}\]/);
});

test("live service validates provider policy before owner and payment", () => {
  const src = read("apps/live-service/server.mjs");
  const inspectStart = src.indexOf("async function inspectLiveCapability");
  const policy = src.indexOf("verifyServicePolicy({ capability, policy: context.policy", inspectStart);
  const verifyStart = src.indexOf("async function verifyLiveCapability", inspectStart);
  const owner = src.indexOf("requester does not control the current live capability cell", verifyStart);
  const handlerStart = src.indexOf("async function handleInvokeRequest");
  const auth = src.indexOf("authenticateProtectedRequest(requestBody, service)", handlerStart);
  const quote = src.indexOf("createPaymentQuote(req, requestBody, service)", handlerStart);
  assert.ok(policy > inspectStart && verifyStart > policy && owner > verifyStart, "provider policy must be checked before owner success");
  assert.ok(auth > handlerStart && quote > auth, "payment quote must happen after entitlement verification path");
});

test("wallet challenge is an intent signature bound to capability and request hash", () => {
  const server = read("apps/live-service/server.mjs");
  const web = read("apps/web/src/App.tsx");
  const challenge = server.slice(server.indexOf("function challengeMessage"), server.indexOf("async function withTimeout"));
  assert.match(challenge, /action=invoke/);
  assert.match(challenge, /capability_outpoint=/);
  assert.match(challenge, /request_hash=/);
  assert.match(challenge, /policy_fingerprint=/);
  assert.match(server, /CHALLENGE_INTENT_MISMATCH/);
  assert.match(web, /const requestHash = await sha256Hex\(requestMaterial\)/);
  assert.match(web, /address,\s*outPoint,\s*requestHash,\s*service:/);
});

test("payment quote binding includes canonical provider-policy fingerprint and resource", () => {
  const src = read("apps/live-service/server.mjs");
  const binding = src.slice(src.indexOf("function paymentBinding"), src.indexOf("function resourceUrl"));
  assert.match(binding, /policyFingerprint:\s*context\.fingerprint/);
  assert.match(binding, /policyId:\s*context\.policyId/);
  assert.match(binding, /resource:\s*resourceUrl\(req, service\)/);
  assert.match(binding, /requestHash:\s*requestInputHash\(service, body\.input\)/);
});

test("provider issuer rotation is supported without accepting arbitrary issuers", () => {
  const server = read("apps/live-service/server.mjs");
  const web = read("apps/web/src/App.tsx");
  assert.match(server, /CAPABILITY_TRUSTED_ISSUER_IDS/);
  assert.match(server, /trustedIssuerIds:\s*TRUSTED_ISSUER_IDS/);
  assert.match(web, /trustedIssuerIds:\s*config\.trustedIssuerIds/);
  assert.match(web, /Connected wallet is not configured as a trusted SkillPass provider issuer/);
});

test("transfer builder refuses unsafe fee inputs, expired rights, and self-transfer", () => {
  const src = read("packages/ckb-client/src/live.ts");
  assert.match(src, /refusing to use an existing SkillPass capability Cell as a funding\/fee input/);
  assert.match(src, /refusing to transfer an expired capability/);
  assert.match(src, /recipient already owns this capability/);
  assert.match(src, /capability data changed while completing transfer fee/);
});

test("same semantic paid request can reuse a live quote instead of generating duplicate invoices", () => {
  const server = read("apps/live-service/server.mjs");
  const state = read("apps/live-service/state.mjs");
  assert.match(server, /serviceState\.getQuoteByBinding\(binding\)/);
  assert.match(server, /quoteInFlight/);
  assert.match(server, /PAYMENT_PRUNE_INTERVAL_MS/);
  assert.match(state, /quote-binding:/);
});

test("public capability status endpoint reports fresh live-chain ownership", () => {
  const server = read("apps/live-service/server.mjs");
  const discovery = read("apps/live-service/discovery.mjs");
  assert.match(server, /url\.pathname === "\/api\/capability\/status"/);
  assert.match(server, /source:\s*"live-ckb-cell"/);
  assert.match(discovery, /capabilityStatus:\s*"\/api\/capability\/status"/);
});

test("wallet discovery filters wrong service and wrong issuer before presenting passes", () => {
  const src = read("apps/web/src/App.tsx");
  assert.match(src, /expectedServiceId:\s*config\.serviceId/);
  assert.match(src, /trustedIssuerIds:\s*config\.trustedIssuerIds/);
  assert.match(src, /requireTransferable:\s*true/);
});

test("browser payment payload has exactly one payer field", () => {
  const src = read("apps/web/src/App.tsx");
  const paymentBlock = src.slice(src.indexOf('headers["PAYMENT-SIGNATURE"]'), src.indexOf("const res = await fetch", src.indexOf('headers["PAYMENT-SIGNATURE"]')));
  assert.equal((paymentBlock.match(/payer:\s*address/g) || []).length, 1);
});

test("issuer rotation preserves the explicit primary issuer for backward-compatible clients", () => {
  const src = read("apps/live-service/server.mjs");
  assert.match(src, /PRIMARY_TRUSTED_ISSUER_RAW/);
  assert.match(src, /requireHex32\("CAPABILITY_TRUSTED_ISSUER_ID", PRIMARY_TRUSTED_ISSUER_RAW\)/);
  assert.match(src, /: TRUSTED_ISSUER_IDS\[0\]/);
});

test("transfer fee completion cannot silently consume a second SkillPass right", () => {
  const src = read("packages/ckb-client/src/live.ts");
  const transfer = src.slice(src.indexOf("export async function buildTransferCapabilityTx"), src.indexOf("export async function sendAndWait"));
  assert.match(transfer, /tx\.inputs\.slice\(1\)/);
  assert.match(transfer, /refusing to use another SkillPass capability Cell as a transfer funding\/fee input/);
});

test("web UI exposes an explicit fresh live-owner verification control", () => {
  const src = read("apps/web/src/App.tsx");
  assert.match(src, /async function verifyLiveOwner\(cap: Found\)/);
  assert.match(src, /api<CapabilityStatus>\("\/api\/capability\/status"/);
  assert.match(src, /Verify live owner/);
  assert.match(src, /source: "live-ckb-cell"/);
});

test("static frontend delivery uses ETag and immutable caching without caching authorization", () => {
  const src = read("apps/live-service/server.mjs");
  assert.match(src, /staticCache = new Map/);
  assert.match(src, /if-none-match/);
  assert.match(src, /max-age=31536000, immutable/);
  const statusRoute = src.slice(src.indexOf('url.pathname === "/api/capability/status"'), src.indexOf('url.pathname === "/api/challenge"'));
  assert.doesNotMatch(statusRoute, /cache-control.*public/i);
});
