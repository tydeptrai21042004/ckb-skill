# SkillPass Provider Integration

SkillPass is designed so a provider can verify a portable service right without sharing SkillPass's ownership database. Each provider keeps its own policy, trusted issuer list, accepted Capability deployment, signing key, CKB RPC, and protected endpoint.

## Trust model

A provider should independently pin:

- the SkillPass Capability Type Script `codeHash` + `hashType` it accepts;
- the issuer IDs it accepts;
- its own service policy;
- its own CKB finality threshold;
- the gateway/provider public key or SHA-256 fingerprint it trusts.

A signed manifest is tamper-evident, but a production verifier must not trust a public key merely because that same manifest supplied it. Use `verifyTrustedProviderManifest()` with a pinned public key or fingerprint.

## Recommended provider-side live authorization

```js
import { verifySkillPassAuthorization } from "@skillpass/provider-verifier";

const decision = await verifySkillPassAuthorization({
  capability,
  policy,
  requesterLockHash,
  deployment: {
    codeHash: ACCEPTED_CAPABILITY_CODE_HASH,
    hashType: ACCEPTED_CAPABILITY_HASH_TYPE,
  },
  minConfirmations: 1,
  resolveLiveCell: async () => {
    const cell = await ckb.getCellLive(outPoint, true, true);
    if (!cell) return null;

    // Compute this from the provider's own CKB node/RPC view.
    const tip = BigInt(await ckb.getTip());
    const includedAt = BigInt(cell.blockNumber);
    return {
      ...cell,
      lockHash: cell.cellOutput.lock.hash(),
      confirmations: Number(tip - includedAt + 1n),
    };
  },
  resolveSubject,
  paymentRequired,
  paymentVerified,
});

if (!decision.authorized) {
  return new Response("Unauthorized", { status: 403 });
}
```

The high-level verifier checks, in order:

1. the outpoint is still live;
2. its Type Script matches the provider-pinned SkillPass deployment;
3. Cell data decodes as a valid Capability;
4. Type args equal the issuer/capability identity encoded in Cell data;
5. the provider's confirmation threshold is met;
6. service/issuer/expiry/subject policy is valid;
7. the requester controls the current live Cell owner lock;
8. payment is required/verified separately when configured.

This makes the live Cell the ownership source of truth while keeping chain/RPC trust local to each provider.

## Low-level compatibility API

`verifyProviderAuthorization()` is still available for integrations that already perform deployment, identity and finality validation themselves. It should not be the default for a new provider integration.

## Remote protected endpoint

When SkillPass acts as a gateway in front of an independent provider, verify both the Ed25519 signature and the claims that bind the signature to the concrete request:

```js
import { verifyGatewayRequest } from "@skillpass/provider-verifier";

const authorization = verifyGatewayRequest({
  token: request.headers.get("x-skillpass-authorization"),
  publicKeyPem: TRUSTED_SKILLPASS_GATEWAY_KEY,
  expectedProviderId: "provider-a",
  expectedServiceId: SERVICE_ID,
  expectedRequestHash: hashCanonicalRequest(body),
  expectedInvocationKey: request.headers.get("x-skillpass-invocation-key"),
  expectedCapabilityId: capabilityId,
  expectedPolicyFingerprint: policyFingerprint,
});
```

For an idempotent action, persist the `invocationKey` and return the same logical result for retries. SkillPass also protects its own gateway with a single-winner execution lease, but an external side-effecting provider should still deduplicate by invocation key for crash recovery.

## Clean-room acceptance checklist

A real external provider integration is complete when:

1. it can install the public verifier dependency chain without monorepo-relative imports;
2. it owns a distinct provider signing key;
3. it pins its trusted issuers and Capability deployment independently;
4. it has its own CKB RPC/finality policy and protected endpoint;
5. it does not use a shared SkillPass entitlement/ownership database;
6. Alice is authorized while she owns the live Cell;
7. Alice is denied after transfer confirmation;
8. Bob is authorized from the successor live Cell;
9. the same Capability can be verified by another independent provider;
10. for side-effecting endpoints, retries deduplicate by invocation key.
