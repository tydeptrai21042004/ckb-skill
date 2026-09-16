import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createGatewayAssertion, signProviderManifest, verifyGatewayAssertion, verifyProviderManifest, verifyResolvedCapabilityCell, verifySkillPassAuthorization } from "../src/index.mjs";
import { encodeCapabilityHex, encodeTypeArgs } from "@skillpass/capability-codec";
import { createServicePolicy } from "@skillpass/service-rights";

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
