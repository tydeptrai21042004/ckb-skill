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

A provider remains responsible for checking that the resolved live Cell belongs to the expected SkillPass Type Script deployment before passing it to this helper. This keeps chain/RPC trust and provider policy local to that provider.

## Signed provider manifest

`signProviderManifest()` and `verifyProviderManifest()` use Ed25519. Public production deployments require a provider-manifest signing key. The manifest also publishes the public key used to verify short-lived gateway assertions when configured.

## Gateway authorization

`createGatewayAssertion()` produces a short-lived Ed25519 assertion bound to provider/service, capability, owner, request hash, policy, operation/delegation and invocation identifiers. A remote provider should call `verifyGatewayAssertion()` and then compare every claim to the HTTP request it is about to execute.
