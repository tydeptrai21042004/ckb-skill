# SkillPass v1.3 Provider Policy Modes

SkillPass separates the **on-chain Capability format** from the provider's service policy. The same compact Capability v1 Cell can support different commercial models without changing the contract layout.

## Why this exists

A portable right is useful for CKB-native assets, transferable agent bundles, memberships, or multi-provider entitlements. It is *not* appropriate for every SaaS product. Some providers need non-transferable licenses, abuse revocation, or owner-only access.

v1.3 therefore makes these choices explicit per service.

## Policy controls

| Control | Meaning |
| --- | --- |
| `rightMode: "owned"` | A live, policy-valid Capability is treated as an owned service right. SkillPass provider administration cannot revoke it. |
| `rightMode: "license"` | The provider may deny the service with a server-side revocation record. The Capability must carry `FLAG_REVOCABLE`. |
| `requireTransferable` | When `true`, the Capability must carry `FLAG_TRANSFERABLE`. When `false`, non-transferable licenses are accepted. |
| `delegationAllowed` | When `false`, owner-signed agent delegation is rejected even if the Cell carries `FLAG_DELEGATABLE`. |
| `requireDelegatable` | When `true`, the Capability must carry `FLAG_DELEGATABLE`. Cannot be combined with `delegationAllowed: false`. |
| `trustedIssuerIds` | Provider lock-script hashes accepted for this particular service. This enables independent providers in one gateway. |
| `policyId`, `termsHash`, `url` | Public policy identity/metadata included in discovery and intent binding. |

## Recommended profiles

### 1. Portable CKB-native owned right

```json
{
  "rightMode": "owned",
  "requireTransferable": true,
  "delegationAllowed": true,
  "requireDelegatable": true
}
```

Use for a service entitlement intended to follow ownership of a digital asset or AI agent.

### 2. Commercial transferable license with provider safety valve

```json
{
  "rightMode": "license",
  "requireTransferable": true,
  "delegationAllowed": true,
  "requireDelegatable": false
}
```

Use when transfer is a product feature but the provider still needs an explicit abuse/compliance revocation path.

### 3. Conventional non-transferable SaaS license

```json
{
  "rightMode": "license",
  "requireTransferable": false,
  "delegationAllowed": false,
  "requireDelegatable": false
}
```

This is intentionally less "crypto-native" but makes SkillPass usable where transferable subscriptions would be commercially inappropriate.

## Multi-provider configuration

`SKILLPASS_SERVICE_POLICIES_JSON` is keyed by service slug. Issuer trust is evaluated **per service**, not as one global union.

```dotenv
SKILLPASS_SERVICE_POLICIES_JSON={"paper-analyzer-v1":{"rightMode":"owned","requireTransferable":true,"delegationAllowed":true,"requireDelegatable":true,"trustedIssuerIds":["0xPROVIDER_A_LOCK_HASH"],"policyId":"provider-a-owned-v1"},"research-insights-v1":{"rightMode":"license","requireTransferable":false,"delegationAllowed":false,"trustedIssuerIds":["0xPROVIDER_B_LOCK_HASH"],"policyId":"provider-b-license-v1"}}
```

For readable production configuration, generate the JSON from a secrets/configuration system rather than hand-editing a long line.

## Provider revocation semantics

Provider revocation is deliberately a **service-layer policy decision**. It does not burn, mutate, or seize the user's CKB Cell.

A license-mode protected request succeeds only if:

1. the Cell is live;
2. the Capability matches the registered service/deployment;
3. its issuer is trusted for that service;
4. the Capability satisfies required flags and expiry;
5. it is not present in the provider revocation store;
6. the requester is the live owner or a valid permitted delegate;
7. optional payment succeeds.

An owned-right service skips step 5 and rejects provider revocation administration with `REVOCATION_NOT_ALLOWED`.

## Provider administration

Set a strong secret:

```dotenv
SKILLPASS_ADMIN_TOKEN=<at-least-32-random-characters>
```

List current revocations:

```bash
SKILLPASS_BASE_URL=https://skillpass.example.com \
SKILLPASS_ADMIN_TOKEN="$SKILLPASS_ADMIN_TOKEN" \
npm run provider:admin -- list --service research-insights-v1
```

Revoke a live license by exact outpoint:

```bash
npm run provider:admin -- revoke \
  --service research-insights-v1 \
  --tx-hash 0x... \
  --index 0x0 \
  --reason "abuse investigation"
```

Restore it:

```bash
npm run provider:admin -- restore \
  --service research-insights-v1 \
  --capability-id 0x...
```

The CLI reads the admin token from `SKILLPASS_ADMIN_TOKEN` or `SKILLPASS_ADMIN_TOKEN_FILE` and does not print it.

## Security boundary

A `license` policy is not a substitute for CKB ownership checks. A payment or revocation-store entry can never create entitlement. The service always validates the live Cell first.
