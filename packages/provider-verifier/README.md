# @skillpass/provider-verifier

Provider-side verification primitives for SkillPass. This package is deliberately usable without a shared SkillPass ownership database: the provider supplies its own CKB live-cell resolver and, for Capability v2, its own subject resolver.

## Independent authorization

```js
import { verifyProviderAuthorization } from "@skillpass/provider-verifier";

const decision = await verifyProviderAuthorization({
  capability,
  policy,
  requesterLockHash,
  resolveLiveCell: async () => {
    const cell = await ckb.getCellLive(capabilityOutPoint, true, true);
    if (!cell) throw new Error("capability is not live");
    return { ...cell, lockHash: cell.cellOutput.lock.hash() };
  },
  resolveSubject: async (capability) => subjectResolver.resolve(capability),
  paymentRequired: true,
  paymentVerified: true,
});
```

A provider remains responsible for checking that the resolved live Cell belongs to the accepted SkillPass Type Script deployment before passing it to this helper. This keeps chain/RPC trust and provider policy local to that provider.

## Signed provider manifest and trust pinning

`signProviderManifest()` signs a manifest with Ed25519. `verifyProviderManifest()` verifies signature/tamper integrity. For a real trust decision use `verifyTrustedProviderManifest()` with a public key or SHA-256 SPKI fingerprint obtained independently of the manifest:

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

The manifest may publish its public key for transport convenience, but a self-published key is not a trust anchor.

## Gateway authorization

`createGatewayAssertion()` produces a short-lived Ed25519 assertion bound to provider/service, capability, owner, request hash, policy, operation/delegation and invocation identifiers.

Remote providers should prefer `verifyGatewayRequest()` so signature verification and claim binding happen together:

```js
const authorization = verifyGatewayRequest({
  token: req.headers["x-skillpass-authorization"],
  publicKeyPem: TRUSTED_GATEWAY_KEY,
  expectedProviderId: "provider-a",
  expectedServiceId: SERVICE_ID,
  expectedRequestHash: hashRequest(body),
  expectedInvocationKey: req.headers["x-skillpass-invocation-key"],
});
```

For side-effecting services, the provider should also persist/deduplicate `invocationKey`. SkillPass's gateway has its own single-winner execution lease, while upstream idempotency protects crash/retry boundaries outside the gateway process.
