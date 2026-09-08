# SkillPass Service Gateway

The service gateway lets an operator put an existing **read/idempotent JSON POST endpoint** behind the same CKB Capability + optional Fiber/x402 authorization used by built-in SkillPass services.

## Enable it

Set:

```dotenv
SKILLPASS_GATEWAY_UPSTREAM_URL=https://api.example.com/private-query
SKILLPASS_GATEWAY_NAME=Private Research API
SKILLPASS_GATEWAY_SERVICE_ID=0xcba940e239ea36ad3722797679307193b2965b9e7f75bdbaadd981ed0482593f
SKILLPASS_GATEWAY_MAX_INPUT_CHARS=20000
SKILLPASS_GATEWAY_MAX_RESPONSE_BYTES=256000
SKILLPASS_GATEWAY_AUTH_BEARER=

# Optional: override the global PAYMENT_AMOUNT for individual services.
# Values are atomic-unit integer strings.
SKILLPASS_SERVICE_PRICES_JSON={"research-insights-v1":"200000","private-json-gateway-v1":"500000"}
```

The upstream URL is fixed by the operator. Clients cannot supply or override a host/path. Public production requires HTTPS and forbids credentials embedded in the URL.

When `PAYMENTS_REQUIRED=true`, `PAYMENT_AMOUNT` remains the default price. `SKILLPASS_SERVICE_PRICES_JSON` can override that amount by registered service slug; unknown slugs or non-positive/non-integer amounts fail startup instead of silently mispricing a service.

The service appears automatically in:

- `GET /api/services`
- `GET /api/config`
- `GET /.well-known/skillpass.json`
- `GET /api/openapi.json`

The protected endpoint is:

```text
POST /api/invoke/private-json-gateway-v1
```

## Upstream contract

SkillPass sends JSON and requires a JSON response. It also attaches:

```text
x-skillpass-service-id
x-skillpass-capability-id
x-skillpass-request-id
```

If configured, `SKILLPASS_GATEWAY_AUTH_BEARER` is added server-side and is never published in discovery metadata.

## Safety boundary

Use this adapter for queries, inference, analysis, reads, previews, or other operations that are naturally idempotent. Do **not** put an irreversible side effect behind it until the upstream participates in an idempotency/outbox protocol.

## v1.2 multi-upstream configuration

The legacy `SKILLPASS_GATEWAY_UPSTREAM_URL` variables remain supported. For more than one external read/query API, use:

```dotenv
SKILLPASS_GATEWAY_ALLOWED_HOSTS=search.example.com,model.example.com
SKILLPASS_UPSTREAM_SERVICES_JSON=[{"slug":"private-search-v1","id":"0x...","name":"Private Search","url":"https://search.example.com/query","inputKind":"json","maxInputChars":20000,"maxResponseBytes":256000,"timeoutMs":8000,"operationMode":"read"},{"slug":"model-query-v1","id":"0x...","name":"Model Query","url":"https://model.example.com/infer","inputKind":"text","maxInputChars":8000,"operationMode":"read"}]
SKILLPASS_UPSTREAM_BEARERS_JSON={"private-search-v1":"server-side-secret"}
SKILLPASS_SERVICE_PRICES_JSON={"private-search-v1":"200000","model-query-v1":"500000"}
```

Public production requires HTTPS and an exact `SKILLPASS_GATEWAY_ALLOWED_HOSTS` match. Literal private/loopback/link-local targets, embedded URL credentials, redirects, oversized responses, and long upstream waits are rejected.

The generic gateway deliberately accepts only `operationMode: "read"`. Side-effecting write APIs need a durable idempotency/outbox contract before they should be enabled.
