# @skillpass/provider-verifier

Provider-side verification primitives for SkillPass. The package does not require a shared SkillPass ownership database: each provider keeps its own CKB RPC, accepted Capability deployment, issuer trust, service policy, signing keys, and optional subject resolver.

## Recommended: safe live authorization

Use `verifySkillPassAuthorization()` for external-provider integrations. It validates the accepted Capability Type Script deployment, decodes the live Cell data itself, checks Type args against issuer/capability identity, enforces the provider's confirmation threshold, and only then evaluates policy/current ownership.

```js
import { verifySkillPassAuthorization } from "@skillpass/provider-verifier";

const decision = await verifySkillPassAuthorization({
  capability,
  policy,
  requesterLockHash,
  deployment: {
    codeHash: process.env.CAPABILITY_CODE_HASH,
    hashType: process.env.CAPABILITY_HASH_TYPE,
  },
  minConfirmations: 1,
  resolveLiveCell: async () => {
    const cell = await ckb.getCellLive(capabilityOutPoint, true, true);
    if (!cell) return null;

    // confirmations must be computed from the provider's own trusted CKB view.
    const tip = await ckb.getTip();
    const includedAt = BigInt(cell.blockNumber);
    const confirmations = Number(BigInt(tip) - includedAt + 1n);
    return {
      ...cell,
      lockHash: cell.cellOutput.lock.hash(),
      confirmations,
    };
  },
  resolveSubject: async (capability) => subjectResolver.resolve(capability),
  paymentRequired: true,
  paymentVerified: true,
});
```

A consumed/transferred old outpoint fails before authorization. A valid payment never substitutes for ownership.

`verifyProviderAuthorization()` remains available as a low-level compatibility primitive. It assumes the caller already verified the deployment, Capability identity, and finality; new external integrations should prefer `verifySkillPassAuthorization()`.

## Signed provider manifest and trust pinning

`signProviderManifest()` produces an Ed25519 manifest envelope with a strict UTC `issuedAt`, a required expiry (24 hours by default), and a maximum seven-day lifetime. `verifyProviderManifest()` verifies integrity and timestamp validity. For a trust decision use `verifyTrustedProviderManifest()` with a key/fingerprint obtained independently of the manifest:

```js
import {
  publicKeyFingerprint,
  verifyTrustedProviderManifest,
} from "@skillpass/provider-verifier";

const ok = verifyTrustedProviderManifest({
  signedManifest,
  trustedFingerprint: "sha256:...",
});
```

The embedded public key is transport convenience, not a trust anchor.

## Gateway authorization

`createGatewayAssertion()` produces a short-lived Ed25519 assertion. Envelope fields (`version`, `keyId`, `issuedAt`, `expiresAt`, `nonce`) are reserved and cannot be supplied through untrusted claims.

Remote providers should prefer `verifyGatewayRequest()` so signature verification and concrete request binding happen together:

```js
const authorization = verifyGatewayRequest({
  token: req.headers["x-skillpass-authorization"],
  publicKeyPem: TRUSTED_GATEWAY_KEY,
  expectedProviderId: "provider-a",
  expectedServiceId: SERVICE_ID,
  expectedRequestHash: hashRequest(body),
  expectedInvocationKey: req.headers["x-skillpass-invocation-key"],
  expectedCapabilityId: capabilityId,
  expectedPolicyFingerprint: policyFingerprint,
});
```

For side-effecting services, persist/deduplicate `invocationKey`. SkillPass's gateway has its own single-winner execution lease, while upstream idempotency protects crash/retry boundaries outside the gateway process.


## Portable authorization evidence

Providers can sign a stable authorization evidence record and let reviewers verify it outside the gateway:

```js
import {
  signAuthorizationEvidence,
  verifyAuthorizationEvidence,
  publicKeyFingerprint,
} from "@skillpass/provider-verifier";

const signed = signAuthorizationEvidence({
  evidence,
  privateKeyPem: PROVIDER_EVIDENCE_PRIVATE_KEY,
  keyId: "provider-a-evidence-v1",
});

const valid = verifyAuthorizationEvidence({
  evidence: signed,
  trustedFingerprint: publicKeyFingerprint(TRUSTED_PROVIDER_PUBLIC_KEY),
});
```

`hashAuthorizationEvidence()` deliberately excludes database storage metadata and the signature envelope, so a JSON evidence file remains verifiable after export. The SkillPass reference gateway returns an opaque per-evidence access token; only the SHA-256 token digest is persisted.

For CLI verification of an exported proof:

```bash
npm run evidence:verify -- evidence.json
npm run evidence:verify -- evidence.json --fingerprint sha256:...
```
