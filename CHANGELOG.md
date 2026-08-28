# Changelog

## v0.4.0 — 2026-08-28

### Deployment

- Added `deploy.sh` with `demo`, `init-testnet`, `doctor`, `testnet`, `fiber-init`, `testnet-fiber`, `status`, `logs`, and `stop` commands.
- Added zero-config Docker demo Compose profile.
- Added real testnet Compose profile with private facilitator networking and persistent settlement/replay state.
- Added optional self-hosted official `nervos/fiber:0.9.0` profile.
- Added safe Fiber Docker initializer: user supplies the existing key explicitly; script does not create/fund wallets or open channels.
- Added Docker readiness/liveness checks and non-root application containers.
- Added `.env.testnet.example`; fixed the previous missing `.env.live.example` bootstrap bug.
- Added automatic random facilitator auth token generation and optional import from `deployments/testnet.json`.

### Live paid path

- Integrated x402/Fiber payment into the real `apps/live-service` `/api/analyze` path.
- Added pre-billing live-capability/current-owner check to avoid charging obviously invalid requests.
- Added request-bound payment quotes.
- Added facilitator verification before CKB signed authorization, followed by a second live-cell check and settlement before protected delivery.
- Added `PAYMENT-REQUIRED` and `PAYMENT-RESPONSE` handling to the real service.
- Added facilitator HTTP client with timeout and bearer authentication support.
- Added facilitator/FNN readiness probes.

### Verification

- Test count increased from 36 to **38**, adding HTTP facilitator/auth and backend-health tests.
- Existing HTTP, facilitator, and combined paid-transfer smoke flows remain green.

### Boundaries

- Fiber scheme/network registration remains experimental relative to x402 core.
- Mock Fiber remains staging evidence only.
- Production multi-replica deployments still need a shared atomic challenge/replay store.

## v0.3.0 — 2026-08-28

- Added portable Node/Rust bootstrap, optional OffCKB/FNN installation, x402/Fiber compatibility layer, combined payment + capability tests, benchmark, and CI scaffolding.
