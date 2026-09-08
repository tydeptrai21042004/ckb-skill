# Vercel UI/API hotfix — Week 9

This revision fixes the production symptom:

```text
Configuration error: Unexpected token 'A', "A server e"... is not valid JSON
```

## What caused the browser error

The React client previously called `response.json()` unconditionally. If the Vercel API service failed during bootstrap, Vercel could return a plain-text infrastructure error instead of SkillPass JSON. The browser then failed while parsing that text and exposed the JSON parser error in the UI.

This revision fixes both layers:

1. `apps/live-service/server.ts` and `apps/fiber-facilitator/server.ts` now export the Node HTTP server for Vercel and return a bounded JSON `503` fallback if application bootstrap fails.
2. `server.mjs` only calls `listen()` outside Vercel.
3. The web client reads API responses as text first and parses JSON defensively.
4. End users now see only a generic `Service unavailable` state. Request IDs and bootstrap diagnostics remain in logs/console rather than the product UI.

## Required Vercel production configuration

The hardened public deployment intentionally uses shared state to prevent one-time challenge replay across multiple Vercel instances. Do **not** weaken this to local/in-memory state in production.

Required deployment values include:

```dotenv
CAPABILITY_CODE_HASH=0x...
CAPABILITY_HASH_TYPE=data2
CAPABILITY_DEP_TX_HASH=0x...
CAPABILITY_DEP_INDEX=0
CAPABILITY_TRUSTED_ISSUER_ID=0x...

STATE_BACKEND=postgres
DATABASE_URL=postgresql://...
POSTGRES_POOL_MAX=2
TRUST_PROXY=true
SKILLPASS_PUBLIC_PRODUCTION=true
ENABLE_PUBLIC_ISSUE=false

PAYMENTS_REQUIRED=false
FIBER_NETWORK=testnet
FACILITATOR_AUTH_TOKEN=<32+ random characters>
```

`DATABASE_URL` should normally come from the Vercel/Neon integration instead of being committed to the repository.

Before redeploying:

```bash
npm run vercel:check
npm test
npm run verify:deploy
npm run security:preflight
```

Then deploy a Preview first. Confirm these URLs return JSON before promoting to Production:

```text
/api/config
/api/status
/health
```

For `/api/config`, the browser should receive `Content-Type: application/json`. A `503` JSON response means the new bootstrap guard is working but one or more required environment values/services are still missing. Check Vercel service logs for the exact server-side bootstrap error.

## Production UI changes

The primary page now shows only what a service user needs:

- connect wallet;
- choose a pass;
- run the protected service;
- see the result.

The following were removed from the primary workflow:

- the three-step marketing panel;
- always-visible CKB/Fiber diagnostics;
- CKB tip information;
- x402 version badges;
- full capability/service/issuer IDs;
- test-provider issuance controls.

Transfer, live-owner verification, and raw on-chain identifiers are still available under **Manage this pass**, with identifiers nested under **Technical details**. Testnet issuance is collapsed and only rendered when `ENABLE_PUBLIC_ISSUE` is enabled.
