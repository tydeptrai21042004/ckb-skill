import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  createGatewayAssertion,
  publicKeyFingerprint,
  signProviderManifest,
  verifyGatewayRequest,
  verifyTrustedProviderManifest,
} from "../packages/provider-verifier/src/index.mjs";

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

test("provider manifest trust is pinned outside the signed manifest", () => {
  const a = keys();
  const b = keys();
  const signed = signProviderManifest({ manifest: { provider: { id: "provider-a" }, services: [] }, privateKeyPem: a.privateKeyPem });
  assert.equal(verifyTrustedProviderManifest({ signedManifest: signed, trustedFingerprint: publicKeyFingerprint(a.publicKeyPem) }), true);
  assert.equal(verifyTrustedProviderManifest({ signedManifest: signed, trustedFingerprint: publicKeyFingerprint(b.publicKeyPem) }), false);
  assert.equal(verifyTrustedProviderManifest({ signedManifest: signed }), false, "trust verifier must not accept an unpinned embedded key");
});

test("gateway helper binds signature to provider, service, body hash and invocation", () => {
  const k = keys();
  const claims = {
    providerId: "provider-a",
    serviceId: `0x${"11".repeat(32)}`,
    requestHash: "22".repeat(32),
    invocationKey: "33".repeat(32),
    capabilityId: `0x${"44".repeat(32)}`,
    policyFingerprint: "55".repeat(32),
    operationId: "job-7",
  };
  const token = createGatewayAssertion({ claims, privateKeyPem: k.privateKeyPem, now: 1000, ttlSeconds: 30 });
  const payload = verifyGatewayRequest({
    token,
    publicKeyPem: k.publicKeyPem,
    expectedProviderId: claims.providerId,
    expectedServiceId: claims.serviceId,
    expectedRequestHash: claims.requestHash,
    expectedInvocationKey: claims.invocationKey,
    expectedCapabilityId: claims.capabilityId,
    expectedPolicyFingerprint: claims.policyFingerprint,
    expectedOperationId: claims.operationId,
    now: 2000,
  });
  assert.equal(payload.operationId, "job-7");
  assert.throws(
    () => verifyGatewayRequest({ token, publicKeyPem: k.publicKeyPem, expectedProviderId: "provider-b", expectedServiceId: claims.serviceId, expectedRequestHash: claims.requestHash, now: 2000 }),
    (error) => error?.code === "GATEWAY_ASSERTION_CLAIM_MISMATCH",
  );
});
