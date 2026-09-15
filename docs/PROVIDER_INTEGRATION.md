# SkillPass Provider Integration

SkillPass is designed so a provider can verify a portable service right without sharing SkillPass's ownership database. The provider keeps its own policy, trusted issuer list, signing key, CKB RPC, and protected endpoint.

## Trust model

A provider should independently pin:

- the SkillPass Capability Type Script deployment it accepts;
- the issuer IDs it accepts;
- its own service policy;
- the gateway/provider signing key or SHA-256 public-key fingerprint it trusts.

A signed manifest is tamper-evident, but a production verifier must not trust a public key merely because that same manifest supplied it. Use `verifyTrustedProviderManifest()` with a pinned public key or fingerprint.

## Provider-side live authorization

```js
import { verifyProviderAuthorization } from "@skillpass/provider-verifier";

const decision = await verifyProviderAuthorization({
  capability,
  policy,
  requesterLockHash,
  resolveLiveCell: async () => {
    const cell = await ckb.getCellLive(outPoint, true, true);
    if (!cell) throw new Error("capability is not live");

    // Before returning, verify the accepted SkillPass Type Script deployment.
    return {
      ...cell,
      lockHash: cell.cellOutput.lock.hash(),
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

The live Cell is the ownership source of truth. A consumed/transferred old outpoint must not authorize the previous owner.

## Remote protected endpoint

When SkillPass is acting as a gateway in front of an independent provider, verify both the Ed25519 signature and the claims that bind that signature to the concrete request:

```js
import { verifyGatewayRequest } from "@skillpass/provider-verifier";

const authorization = verifyGatewayRequest({
  token: request.headers.get("x-skillpass-authorization"),
  publicKeyPem: TRUSTED_SKILLPASS_GATEWAY_KEY,
  expectedProviderId: "provider-a",
  expectedServiceId: SERVICE_ID,
  expectedRequestHash: hashCanonicalRequest(body),
  expectedInvocationKey: request.headers.get("x-skillpass-invocation-key"),
});
```

For an idempotent action, persist the `invocationKey` and return the same logical result for retries. SkillPass also protects its own gateway with a single-winner execution lease, but an external side-effecting provider should still deduplicate by invocation key for crash recovery.

## Independent-provider acceptance checklist

A real external provider integration is complete when:

1. it owns a distinct provider signing key;
2. it pins its trusted issuers and Capability deployment independently;
3. it has its own policy and endpoint;
4. it does not use a shared SkillPass entitlement/ownership database;
5. Alice is authorized while she owns the live Cell;
6. Alice is denied after transfer confirmation;
7. Bob is authorized from the successor live Cell;
8. the same Capability can be verified by another independent provider.
