# v0.8.0 — XSS and browser-request hardening

- Added shared `packages/http-security` helpers for JSON-only mutation requests, Fetch Metadata cross-site rejection, safe route parsing and bounded plain-text errors.
- Strengthened CSP on demo/live/facilitator responses.
- Enforced Trusted Types in the dependency-free demo and added report-only Trusted Types for the CCC frontend.
- Removed broad HTTPS image allowance from the live CSP.
- Added 18 dedicated security/XSS tests covering DOM sinks, inline handlers, malicious HTML/SVG/URL payloads, malformed JSON reflection, security headers and request guards.
- Added a headless Chromium XSS/CSP/Trusted-Types smoke harness.
- Added Vietnamese `BAO_MAT_XSS_VI.md`.

# Changelog

## v0.7.0 — product-ready frontend

- Replaced the local demo's giant hero, numbered card grid, repeated action buttons, and terminal-first presentation with a compact product workspace.
- Added a single identity selector, access-mode selector, paper editor, structured result panel, reversible Alice/Bob transfer control, and collapsible activity log.
- Reworked the real React/CCC frontend into a pass-selector + service-workspace layout instead of repeating an editor and transfer form inside every capability card.
- Added structured analysis metrics, preview, marker output, focused empty/error states, and a dedicated payment modal.
- Added a clean disconnected-wallet onboarding screen and compact CKB/Fiber readiness indicators.
- Kept wallet signing through the official CCC connector and themed its supported CSS variables to match SkillPass.
- Removed decorative gradients and default canned paper content from the live app.
- Added mobile layouts for both the local simulator and the CCC/testnet frontend.
- Added frontend source regression tests so the old prototype/card layout is not accidentally restored.

## v0.6.0 — operator UX, Windows deployment, Vietnamese runbooks

- Added native Windows deployment helpers: `deploy.cmd` and `deploy.ps1`.
- Added `GET /api/status` and stronger readiness reporting with sanitized CKB/Fiber dependency state.
- Web UI now shows deployment health, CKB tip, and Fiber readiness.
- Web paper draft is persisted locally in the browser and enforces the server-advertised input limit.
- Payment UX now supports copying payment hash and dismissing an unpaid invoice panel safely.
- Added `backup-state` for SkillPass/facilitator application-state exports without copying secrets or live Fiber channel storage.
- Added `npm run support` to produce a redacted `.runtime/support-bundle.json` for community/debugging handoff.
- Added Vietnamese documentation: deployment, usage, architecture/security, troubleshooting, and CKB/Fiber ecosystem positioning.
- Kept the production safety boundary: no automated user-key handling, funding, channel opening, or spending.


- Added machine-readable agent discovery (`/.well-known/skillpass.json`) and OpenAPI 3.1 (`/api/openapi.json`) for safe tool/agent integration.
## v0.5.0 — 2026-09-05

### Reliability and paid-request correctness

- Fixed a persisted replay-store first-load race that could let a concurrent first request observe an empty in-memory map before disk state finished loading.
- Added persistent live-service payment quotes and successful delivery receipts.
- Added exact semantic retry recovery after settlement when the HTTP response is lost or the service restarts.
- Made facilitator settlement idempotent so the service can recover the narrow crash window after payment consumption but before its delivery receipt is persisted.
- Added configurable bounded delivery-receipt retention (`SERVICE_RECEIPT_TTL_SECONDS`, default 24 hours).
- Bound payment quotes to the protected request text/service/capability identity so a paid quote cannot be reused for different work.
- Changed the live paid lifecycle to **verify payment -> verify wallet/live capability -> execute protected work -> settle -> persist receipt -> respond** so a resource-handler failure does not consume payment first.
- Added paper input validation before invoice creation.

### Fiber/x402 hardening

- Added optional `FIBER_PAYMENT_PROOF=preimage` mode; SHA-256 of the submitted 32-byte preimage must match the invoice payment hash and the receiver still has to report the invoice paid.
- Kept `invoice-status` as the compatibility default while upstream Fiber x402 work remains evolving.
- Mock `/dev/pay` is now disabled by default and enabled only by explicit demo/smoke configuration.
- Added strict facilitator backend/network/proof-mode startup validation, amount/expiry/currency/description checks, request/header timeouts, and constant-time bearer-token comparison.
- Made idempotent settlement require the same persisted payment requirement/payer fingerprint, so a consumed hash cannot be repurposed with altered settlement metadata.
- Sanitized public facilitator readiness output so raw FNN node metadata is not exposed.
- `/supported` exposes the configured payment-proof mode.

### Deployment and operations

- Restored missing `.env.example` and `.env.testnet.example`, fixing clean-ZIP setup and `./deploy.sh init-testnet`.
- Added `.nvmrc`, `.gitignore`, and `.dockerignore` for safer local handoff.
- Fixed release ZIP exclusions so environment example templates are retained while private `.env`/runtime files are excluded.
- Added `DEPLOY_STEP_BY_STEP.md` with a GitHub-independent ZIP/folder deployment flow.
- Expanded `./deploy.sh doctor` validation and added `./deploy.sh smoke`.
- Docker-only deploy no longer hard-requires host Node.js for the post-start smoke check; it uses Node, then curl, otherwise relies on container health with a warning.
- Testnet Compose now persists service state, binds public SkillPass to loopback by default, and hardens Node containers with read-only filesystem, dropped Linux capabilities, and `no-new-privileges`.
- Added canonical `PUBLIC_BASE_URL` / explicit `TRUST_PROXY` behavior.

### Ecosystem alignment

- Added `docs/community-research-2026.md` covering Fiber v0.9.0 reliability/provider direction, current Fiber+x402 draft work, x402 v2 lifecycle, and CCC strategy.
- Updated `@ckb-ccc/connector-react` from 1.1.7 to 1.1.9 based on the current npm release.

### Verification

- Dependency-free Node test count increased from 38 to **45**.
- All 45 tests pass, including idempotent settlement and receipt-retention regressions.
- HTTP/UI smoke, facilitator smoke, and combined paid-transfer smoke all pass.
- Shell and Node deployment syntax checks pass; Compose YAML parses successfully.
- The current sandbox could not reach npm registry, so the CCC/React production dependency install/build must be rerun in a networked environment.

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
