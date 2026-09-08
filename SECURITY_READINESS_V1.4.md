# SkillPass v1.4 Security & Production-Readiness Review

Review date: 2026-09-09

This hardening pass is intentionally small: it preserves SkillPass's capability Cell, delegation, live ownership verification, service gateway, and Fiber/x402 architecture while tightening deployment and network boundaries.

## What was already strong in v1.3

- Protected operations bind authorization to a fresh signed intent and live CKB ownership rather than trusting a cached wallet/session claim.
- Delegation is scoped and budgeted, with the owner rechecked against live capability state.
- Production state supports PostgreSQL/Redis, atomic challenge consumption, replay protection, and bounded rate limiting.
- Public production rejects local state, public issuance, and development payment modes.
- Request envelopes, JSON content types, Fetch Metadata, CSP/frame protections, body/header limits, timeouts, and upstream response limits are already present.
- The service gateway restricts production upstream hosts/protocols and uses read-only operations with redirect blocking.
- Docker production topology keeps app/data services on a private backend network and supports mounted secrets.

## v1.4 changes applied

1. **Patched and contained the Vite development server**
   - Vite `7.0.0` -> `7.3.5`.
   - Default `npm run dev` binds to `127.0.0.1` rather than all interfaces.
   - Explicit `dev:lan` remains available when LAN exposure is intentional.
   - Vite filesystem access is limited to the web app plus browser-imported workspace packages.
   - `.env`, key/certificate, `.secrets`, and `.runtime` patterns are denied.
   - Production source maps are disabled unless `SKILLPASS_BUILD_SOURCEMAPS=true` is explicitly set.

2. **Aligned Node runtime versions**
   - Docker images now use Node `24.20.0-alpine3.24`, matching the root `engines.node = 24.x` policy.

3. **Made paid production fail closed earlier**
   - A paid public production service now refuses startup unless `FACILITATOR_AUTH_TOKEN` has at least 32 characters.
   - `FACILITATOR_URL` is parsed and constrained to HTTP(S), cannot embed URL credentials, and cannot carry a query/fragment.
   - Plain HTTP is accepted in public Docker production only for loopback/private single-label service hosts (for example `facilitator`); externally addressed facilitator traffic must use HTTPS.

4. **Reduced proxy-header spoofing risk on Vercel**
   - Vercel request identity uses `x-vercel-forwarded-for` only; the generic `x-forwarded-for` fallback is reserved for explicitly trusted non-Vercel proxy deployments.

5. **Hardened server-to-server clients**
   - Facilitator and Fiber RPC clients accept only HTTP(S), reject embedded credentials, and reject redirects.
   - The shared security header set now also disables DNS prefetching.

6. **Added security regression checks and dependency-free CI**
   - `tests/security-readiness-v1.4.test.mjs` protects the new deployment/network invariants.
   - It is included in `npm run test:security`.
   - `.github/workflows/security-readiness.yml` runs the security preflight, complete Node regression suite, and deployment-script syntax checks on Node 24.20.0 without requiring secrets.

## Remaining release blockers / operational work

### High priority before a high-risk production/mainnet launch

- **Commit a root dependency lockfile.** Direct package versions are exact, but transitive dependencies remain non-reproducible. Generate the lockfile using the supported Node 24 environment, then use `npm ci` in CI and container builds where practical.
- **Run the complete test/build matrix on Node 24.** This review environment could not complete npm dependency resolution, so the artifact has static/syntax/regression verification but not a fresh full dependency-backed build.
- **Extend the included CI once the lockfile exists.** Add `npm ci`, `npm audit`, `npm run build:web`, `npm run typecheck:vercel`, and contract tests. The included workflow already runs the dependency-free security/regression checks.
- **Perform an external contract/payment security review before meaningful mainnet funds are at risk.** Application hardening cannot substitute for protocol/contract review.
- **Exercise backup restore and incident response**, not only backup creation. Define token rotation, compromised-capability response, database restore, and facilitator outage procedures.

### Product-readiness improvements

- Replace the single provider admin bearer token with operator identities/RBAC plus an append-only admin audit trail if multiple operators will manage revocations.
- Add explicit delegation/grant revocation for long-lived agent grants. Ownership transfer already invalidates old grants, but a provider/user should also be able to revoke a grant without transferring the capability; until then, keep delegation TTLs short.
- Add production observability: request IDs, structured security events, metrics for challenge/replay/rate-limit/payment failures, SLOs, and alerts. Avoid logging signed payloads, bearer tokens, or complete capability credentials.
- Define idempotency semantics before allowing write/side-effect service operations. The current read-only gateway policy is a good safe default.
- Load-test PostgreSQL/Redis pools and Vercel concurrency with realistic multi-user challenge/payment traffic.
- Browser-test a tighter Vercel CSP with every supported wallet. The current policy is intentionally compatible but broad for `connect-src`, `frame-src`, and inline styles.

## Validation performed in this review

- `node scripts/security-preflight.mjs`: **PASS** (lockfile warning only).
- `npm run test:security`: **25/25 PASS**.
- `node --test`: **169/169 PASS**.
- Syntax checks for changed Node modules and deployment scripts: **PASS**.
- Fresh `npm install --package-lock-only`: **not completed** in the review sandbox (dependency resolution timed out).
- `npm run build:web`: could not be meaningfully completed because the uploaded archive has no installed dependencies; errors were missing `react`, CCC and other modules. Re-run after a clean Node 24 dependency install.

## Readiness judgement

- **Local/testnet demo:** ready.
- **Public testnet pilot with multiple users:** strong candidate after a clean Node 24 install/build/test and real environment smoke test.
- **Production with low-value usage:** architecture is substantially hardened, but add lockfile/CI/monitoring first.
- **Mainnet/high-value or unattended agent spending:** not yet. Require external security review, explicit grant revocation/operational controls, observability, and tested incident/restore procedures.

This document is an engineering review, not a formal security audit or guarantee of vulnerability absence.
