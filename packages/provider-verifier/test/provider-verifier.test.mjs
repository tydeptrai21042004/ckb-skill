import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createGatewayAssertion, signProviderManifest, verifyGatewayAssertion, verifyProviderManifest } from "../src/index.mjs";

function keys() {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

test("provider manifests are Ed25519 signed and tamper evident", () => {
  const k = keys();
  const signed = signProviderManifest({ manifest: { schemaVersion: "2.0", provider: { id: "provider-a" }, services: [] }, privateKeyPem: k.privateKeyPem });
  assert.equal(verifyProviderManifest({ signedManifest: signed, publicKeyPem: k.publicKeyPem }), true);
  assert.equal(verifyProviderManifest({ signedManifest: { ...signed, network: "mainnet" }, publicKeyPem: k.publicKeyPem }), false);
});

test("short-lived gateway assertions are signed and expiry checked", () => {
  const k = keys();
  const token = createGatewayAssertion({ claims: { serviceId: "svc", requestHash: "aa" }, privateKeyPem: k.privateKeyPem, now: 1000, ttlSeconds: 10 });
  assert.equal(verifyGatewayAssertion({ token, publicKeyPem: k.publicKeyPem, now: 5000 }).serviceId, "svc");
  assert.throws(() => verifyGatewayAssertion({ token, publicKeyPem: k.publicKeyPem, now: 12000 }), /expired/);
});
