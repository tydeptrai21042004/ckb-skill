import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createGatewayAssertion, hashAuthorizationEvidence, signAuthorizationEvidence, signProviderManifest, verifyAuthorizationEvidence, verifyGatewayAssertion, verifyProviderManifest, verifyResolvedCapabilityCell, verifySkillPassAuthorization } from "../src/index.mjs";
import { encodeCapabilityHex, encodeTypeArgs } from "../../capability-codec/src/index.mjs";
import { createServicePolicy } from "../../service-rights/src/index.mjs";

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


test("provider manifests reject malformed/unbounded timestamps", () => {
  const k = keys();
  assert.throws(
    () => signProviderManifest({ manifest: { provider: { id: "provider-a" } }, privateKeyPem: k.privateKeyPem, issuedAt: "not-a-time" }),
    /issuedAt/,
  );
  const issuedAt = "2026-09-16T00:00:00.000Z";
  assert.throws(
    () => signProviderManifest({ manifest: { provider: { id: "provider-a" } }, privateKeyPem: k.privateKeyPem, issuedAt, expiresAt: "2026-10-16T00:00:00.000Z" }),
    /within 7 days/,
  );
});

test("gateway claims cannot override signed envelope fields", () => {
  const k = keys();
  assert.throws(
    () => createGatewayAssertion({ claims: { version: 2, serviceId: "svc", requestHash: "aa" }, privateKeyPem: k.privateKeyPem }),
    /reserved/,
  );
});

test("safe verifier binds deployment, capability identity and confirmations before owner authorization", async () => {
  const serviceId = `0x${"11".repeat(32)}`;
  const issuerId = `0x${"22".repeat(32)}`;
  const capabilityId = `0x${"33".repeat(32)}`;
  const requesterLockHash = `0x${"44".repeat(32)}`;
  const capability = {
    version: 1,
    flags: 1,
    serviceId,
    issuerId,
    capabilityId,
    expiry: 2_000_000_000n,
  };
  const deployment = { codeHash: `0x${"55".repeat(32)}`, hashType: "data2" };
  const cell = {
    outputData: encodeCapabilityHex(capability),
    lockHash: requesterLockHash,
    confirmations: 2,
    cellOutput: { type: { ...deployment, args: encodeTypeArgs(capability) } },
  };
  const policy = createServicePolicy({ serviceId, trustedIssuerId: issuerId, requireTransferable: true });

  const checked = verifyResolvedCapabilityCell({ cell, capability, deployment, minConfirmations: 1 });
  assert.equal(checked.lockHash, requesterLockHash);
  assert.throws(
    () => verifyResolvedCapabilityCell({ cell, capability, deployment: { ...deployment, codeHash: `0x${"66".repeat(32)}` }, minConfirmations: 1 }),
    (error) => error?.code === "WRONG_DEPLOYMENT",
  );
  assert.throws(
    () => verifyResolvedCapabilityCell({ cell: { ...cell, confirmations: 0 }, capability, deployment, minConfirmations: 1 }),
    (error) => error?.code === "CAPABILITY_NOT_FINAL",
  );

  const decision = await verifySkillPassAuthorization({
    capability,
    policy,
    requesterLockHash,
    deployment,
    minConfirmations: 1,
    resolveLiveCell: async () => cell,
    nowUnixSeconds: 1_900_000_000n,
  });
  assert.equal(decision.authorized, true);
  assert.equal(decision.confirmations, 2);
});


test("authorization evidence can be signed, exported, and verified offline", () => {
  const k = keys();
  const evidence = {
    version: 1,
    requestId: "req-123",
    requestHash: `0x${"10".repeat(32)}`,
    capabilityId: `0x${"20".repeat(32)}`,
    capabilityOutPoint: { txHash: `0x${"30".repeat(32)}`, index: "0x0" },
    providerId: `0x${"40".repeat(32)}`,
    serviceId: `0x${"50".repeat(32)}`,
    policyHash: "", subjectId: "", subjectOwnerLockHash: "", delegationId: "", paymentProofHash: "",
    decision: "allow", timestamp: "2026-09-16T00:00:00.000Z",
    providerKey: "provider-a", policyId: "bundle-v1", policyFingerprint: "sha256:test",
    currentOwnerLockHash: `0x${"60".repeat(32)}`, chain: { confirmations: 3 },
    invocationKey: "abc", operationId: null, paymentSettlementHash: null, expiresAt: 1_800_000_000_000,
    accessTokenHash: "a".repeat(64),
  };
  const signed = signAuthorizationEvidence({ evidence, privateKeyPem: k.privateKeyPem, keyId: "provider-a-evidence", issuedAt: "2026-09-16T00:00:00.000Z" });
  assert.equal(signed.evidenceHash, hashAuthorizationEvidence(evidence));
  assert.equal(verifyAuthorizationEvidence({ evidence: signed, publicKeyPem: k.publicKeyPem, now: Date.parse("2026-09-16T00:10:00.000Z") }), true);
  assert.equal(verifyAuthorizationEvidence({ evidence: { ...signed, decision: "deny" }, publicKeyPem: k.publicKeyPem, now: Date.parse("2026-09-16T00:10:00.000Z") }), false);
});
