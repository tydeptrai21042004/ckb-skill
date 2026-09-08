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

test("live service pins a trusted provider before ownership/payment", () => {
  const src = read("apps/live-service/server.mjs");
  assert.match(src, /CAPABILITY_TRUSTED_ISSUER_ID/);
  const verifyStart = src.indexOf("async function verifyLiveCapability");
  const policy = src.indexOf("verifyServicePolicy({ capability, policy: servicePolicy", verifyStart);
  const owner = src.indexOf("requester does not control the current live capability cell", verifyStart);
  const quote = src.indexOf("createPaymentQuote(req, requestBody)", src.indexOf('url.pathname === "/api/analyze"'));
  assert.ok(policy > verifyStart && owner > policy, "trusted service policy must be checked before owner success");
  assert.ok(quote > owner, "payment quote must happen after entitlement verification path");
});

test("payment quote binding includes service provider policy identity", () => {
  const src = read("apps/live-service/server.mjs");
  const binding = src.slice(src.indexOf("function paymentBinding"), src.indexOf("function resourceUrl"));
  assert.match(binding, /trustedIssuerId:\s*TRUSTED_ISSUER_ID/);
  assert.match(binding, /policyId:\s*SERVICE_POLICY_ID/);
});

test("wallet discovery filters wrong service and wrong issuer before presenting passes", () => {
  const src = read("apps/web/src/App.tsx");
  assert.match(src, /expectedServiceId:\s*config\.serviceId/);
  assert.match(src, /trustedIssuerId:\s*config\.trustedIssuerId/);
  assert.match(src, /requireTransferable:\s*true/);
});

test("browser payment payload has exactly one payer field", () => {
  const src = read("apps/web/src/App.tsx");
  const paymentBlock = src.slice(src.indexOf('headers["PAYMENT-SIGNATURE"]'), src.indexOf("const res = await fetch", src.indexOf('headers["PAYMENT-SIGNATURE"]')));
  assert.equal((paymentBlock.match(/payer:\s*address/g) || []).length, 1);
});
