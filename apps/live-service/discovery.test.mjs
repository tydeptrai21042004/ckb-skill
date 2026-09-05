import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscovery, buildOpenApi } from "./discovery.mjs";

const deployment = { network: "testnet", codeHash: `0x${"11".repeat(32)}`, hashType: "data1", depTxHash: `0x${"22".repeat(32)}`, depIndex: 0 };

test("agent discovery advertises capability authorization without private-key custody", () => {
  const doc = buildDiscovery({
    deployment,
    serviceId: `0x${"33".repeat(32)}`,
    maxInputChars: 1234,
    payments: { required: true, amount: "100000", asset: "CKB", network: "fiber-testnet", proofMode: "invoice-status" },
  });
  assert.equal(doc.chain.authorizationModel, "current-live-capability-cell-owner");
  assert.equal(doc.authentication.privateKeyLocation, "user-wallet-only");
  assert.equal(doc.payment.protocol, "x402");
  assert.equal(doc.service.maxInputChars, 1234);
  assert.equal(doc.api.openapi, "/api/openapi.json");
});

test("OpenAPI discovery accurately advertises 402 only when payment is enabled", () => {
  const paid = buildOpenApi({ paymentsRequired: true, maxInputChars: 20000 });
  const free = buildOpenApi({ paymentsRequired: false, maxInputChars: 500 });
  assert.ok(paid.paths["/api/analyze"].post.responses["402"]);
  assert.equal(free.paths["/api/analyze"].post.responses["402"], undefined);
  assert.equal(free.paths["/api/analyze"].post.requestBody.content["application/json"].schema.properties.text.maxLength, 500);
});
