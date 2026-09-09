import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY_VERSION_V2,
  CAPABILITY_V2_DATA_LENGTH,
  BINDING_SUBJECT_OWNER,
  BINDING_ATOMIC,
  SUBJECT_AGENT,
  FLAG_TRANSFERABLE,
  FLAG_DELEGATABLE,
  encodeCapability,
  decodeCapability,
} from "../packages/capability-codec/src/index.mjs";
import {
  createServicePolicy,
  verifyServicePolicy,
  verifySubjectBinding,
  authorizeRequest,
  createProviderAcceptance,
  acceptanceAllowsCapability,
  createAuthorizationEvidence,
} from "../packages/service-rights/src/index.mjs";

const h = (byte) => `0x${byte.repeat(64)}`;
const SERVICE = h("1");
const ISSUER = h("2");
const CAP = h("3");
const SUBJECT = h("4");
const POLICY = h("5");
const OWNER = h("6");
const PROVIDER = h("7");
const REQUEST = h("8");
const TX = h("9");

function v2(overrides = {}) {
  return {
    version: CAPABILITY_VERSION_V2,
    flags: FLAG_TRANSFERABLE | FLAG_DELEGATABLE,
    serviceId: SERVICE,
    issuerId: ISSUER,
    capabilityId: CAP,
    expiry: 2_000_000_000n,
    subjectType: SUBJECT_AGENT,
    bindingMode: BINDING_SUBJECT_OWNER,
    subjectId: SUBJECT,
    policyHash: POLICY,
    ...overrides,
  };
}

test("Capability v2 roundtrip preserves subject and policy commitments", () => {
  const encoded = encodeCapability(v2());
  assert.equal(encoded.length, CAPABILITY_V2_DATA_LENGTH);
  assert.deepEqual(decodeCapability(encoded), v2());
});

test("subject-bound provider policy rejects legacy holder-only rights", () => {
  const policy = createServicePolicy({
    serviceId: SERVICE,
    trustedIssuerId: ISSUER,
    requireSubjectBinding: true,
    acceptedSubjectTypes: [SUBJECT_AGENT],
    requiredPolicyHash: POLICY,
  });
  assert.equal(verifyServicePolicy({ capability: v2(), policy, nowUnixSeconds: 100n }).capability.subjectId, SUBJECT);
  const legacy = decodeCapability(encodeCapability({ version: 1, flags: FLAG_TRANSFERABLE, serviceId: SERVICE, issuerId: ISSUER, capabilityId: CAP, expiry: 2_000_000_000n }));
  assert.throws(() => verifyServicePolicy({ capability: legacy, policy, nowUnixSeconds: 100n }), (e) => e.code === "SUBJECT_BINDING_REQUIRED");
});

test("subject ownership mismatch fails closed even when capability owner is valid", () => {
  assert.throws(() => verifySubjectBinding({
    capability: v2(),
    capabilityOwnerLockHash: OWNER,
    subject: { id: SUBJECT, lockHash: h("a"), live: true },
  }), (e) => e.code === "SUBJECT_OWNER_MISMATCH");
});

test("authorization composes entitlement, subject ownership and payment", () => {
  const policy = createServicePolicy({ serviceId: SERVICE, trustedIssuerId: ISSUER, requireSubjectBinding: true });
  const result = authorizeRequest({
    cell: { lockHash: OWNER }, capability: v2(), requesterLockHash: OWNER, policy, nowUnixSeconds: 100n,
    subject: { id: SUBJECT, lockHash: OWNER, live: true }, paymentRequired: true, paymentVerified: true,
  });
  assert.equal(result.authorized, true);
  assert.equal(result.subjectBinding.bound, true);
});

test("federated provider acceptance is independent from capability issuance", () => {
  const acceptance = createProviderAcceptance({
    providerId: PROVIDER,
    bundleId: "research-agent-pro",
    serviceIds: [SERVICE],
    entitlementIds: [SERVICE],
    trustedIssuerIds: [ISSUER],
    subjectTypes: [SUBJECT_AGENT],
    policyHash: POLICY,
  });
  assert.equal(acceptanceAllowsCapability({ acceptance, capability: v2(), serviceId: SERVICE, nowUnixSeconds: 100 }), true);
  assert.equal(acceptanceAllowsCapability({ acceptance, capability: v2({ policyHash: h("b") }), serviceId: SERVICE, nowUnixSeconds: 100 }), false);
});

test("authorization evidence commits to the decision without embedding request payload", () => {
  const evidence = createAuthorizationEvidence({
    requestHash: REQUEST,
    capability: v2({ bindingMode: BINDING_ATOMIC }),
    outPoint: { txHash: TX, index: "0" },
    providerId: PROVIDER,
    serviceId: SERVICE,
    policyHash: POLICY,
    subject: { lockHash: OWNER },
    decision: "allow",
  });
  assert.equal(evidence.subjectId, SUBJECT);
  assert.equal(evidence.decision, "allow");
  assert.equal(Object.hasOwn(evidence, "request"), false);
});
