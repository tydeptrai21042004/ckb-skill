# Validation snapshot — 2026-09-05

This file records what was actually verified while preparing the SkillPass v0.7 local-ZIP bundle. No GitHub account, repository connection, push, or CI service was used.

## Passed in this preparation environment

- Node.js dependency-free test path: **56/56 tests passed**.
- Coverage includes:
  - deterministic ownership/transfer lifecycle;
  - capability codec/version/flag/boundary checks;
  - one-time wallet challenge and replay behavior;
  - paper-input validation;
  - x402 v2 transport/requirements validation;
  - unpaid/paid Fiber invoice behavior;
  - strict replay verification plus idempotent settlement recovery;
  - persisted replay-store restart behavior and concurrent first-load regression;
  - optional payment-preimage proof validation;
  - persistent live-service quote/receipt state and receipt-retention pruning;
  - FNN request-shape/status adapter;
  - facilitator HTTP authentication and backend readiness probes.
  - machine-readable SkillPass discovery metadata and OpenAPI payment-mode behavior;
  - product-UI regression checks for the local simulator and React/CCC frontend;
  - CKB Testnet + CKB-native signer filtering in the CCC connector.
- `npm run smoke:http` passed.
- `npm run smoke:fiber` passed.
- `npm run smoke:paid` passed.
  - The combined flow proves `402 -> pay -> changed-request quote reuse rejected -> owner succeeds -> consumed replay rejected -> transfer -> paid old-owner rejected -> new-owner succeeds`.
- `npm run verify:deploy` passed.
- `bash -n deploy.sh` and `bash -n run_all.sh` passed.
- `node --check` passed for the modified facilitator/live-state/live-service/payment smoke files.
- All included Compose YAML files parsed successfully with PyYAML.
- `./deploy.sh smoke demo` passed against a locally started deterministic demo service.
- `npm run benchmark` passed and refreshed `reports/benchmarks/latest.md`.

## Frontend checks added in v0.7

- The dependency-free local demo no longer uses the old giant hero, radial gradient, numbered card grid, or terminal-first presentation.
- The local demo now has one request CTA, an Alice/Bob identity selector, capability-only vs Fiber+capability mode, structured result output, reversible transfer, and a collapsible technical activity log.
- The React/CCC frontend now has one editor workspace rather than repeating an editor per capability.
- Analysis output is rendered into metrics, preview, and marker sections instead of being serialized into a status message.
- Payment is a dedicated modal secondary flow and contains an explicit private-key/seed-phrase safety reminder.
- CCC is configured for CKB Testnet and filters the wallet picker to CKB-native signers, matching the signature verification implemented by the service.
- `npm run dev:web` now starts the live API and Vite together; `npm run dev:frontend-only` remains available when a separate API is already running.
- Vite proxy targets are configurable with `SKILLPASS_API_ORIGIN` and include `/api`, `/health`, `/readyz`, and `/.well-known`.
- `apps/web/src/App.tsx` and `apps/web/src/main.tsx` passed TypeScript parser/transpile diagnostics using the installed TypeScript compiler. Full React/CCC typecheck and Vite production build still require downloaded npm dependencies.

## Dependency/toolchain-limited checks

The sandbox could start npm registry access but dependency installation did not complete before the execution limit, so no `node_modules` tree was retained. Docker and the Rust/CKB contract toolchain were also unavailable. Therefore the following are deliberately **not** claimed as passed here:

- `npm run typecheck:ckb`;
- `npm run build:web`;
- Docker image builds / Compose runtime health;
- `npm run verify:contract`.

Run `npm run setup && npm run check` on a networked Node 22 host, and run the Rust/Docker checks before publishing a release. The Type Script source was not modified in this v0.7 frontend/product pass.

## Deployment changes validated statically

- Native Windows deployment entry points (`deploy.cmd`, `deploy.ps1`) are included and mirrored with the Bash deployment command set. PowerShell itself is not installed in this Linux sandbox, so Windows runtime execution is not claimed here.
- `GET /api/status` and dependency-aware `/readyz` behavior are present in the live service; unhealthy required dependencies produce a 503 readiness response.
- `GET /.well-known/skillpass.json` and `GET /api/openapi.json` are included in the live-service deployment and in cross-platform deployment smoke checks.
- Release-handoff tests verify that Vietnamese guides and environment templates are included while private/generated runtime files are excluded.
- `npm run support` was executed and the produced JSON contains only redacted/configured-state diagnostics, not secret values.

- `.env.example`, `.env.testnet.example`, and compatibility `.env.live.example` are included.
- `./deploy.sh init-testnet` has a real template to copy and generates a facilitator secret without overwriting an existing private environment file.
- `./deploy.sh doctor` validates Capability metadata, testnet selection, payment settings, receipt retention, Fiber backend/proof mode, public URL/proxy mode, and basic RPC URL shape.
- The testnet stack persists facilitator replay state and SkillPass quote/delivery state.
- Public SkillPass binding defaults to loopback; facilitator/FNN RPC stays private in the supplied Compose profiles.
- Mock `/dev/pay` is disabled unless an explicit demo/smoke profile enables it.
- Release packaging keeps `.env.*.example` templates while excluding private `.env`, runtime state, dependencies, and build output.
- `run_all.sh --with-fiber` uses the official Fiber Docker image path rather than downloading/executing a remote installer script.

## Benchmark boundary

The latest local in-memory verifier benchmark is recorded in `reports/benchmarks/latest.md`. It intentionally excludes CKB RPC, wallet interaction, Fiber routing/payment latency, HTTP WAN latency, and persistent-database costs. Do not present it as end-to-end blockchain/payment performance.

## v0.8 security validation — 2026-09-05

- `npm test`: **74/74 PASS**.
- `npm run test:security`: **18/18 PASS**.
- `npm run smoke:http`: PASS.
- `npm run smoke:fiber`: PASS.
- `npm run smoke:paid`: PASS.
- `npm run verify:deploy`: PASS.
- Headless Chromium security harness is included. In this execution sandbox it is **SKIPPED** because the installed Chromium is organization-policy blocked from loading local test pages. The harness can be made mandatory with `REQUIRE_BROWSER_SECURITY=1 npm run smoke:security-browser` on a normal CI/deployment machine.

The security suite includes script/img/SVG/textarea breakout/javascript-URL/iframe-srcdoc/MathML-style XSS payloads, CSP header assertions, DOM-sink regression checks, JSON-only mutation checks, Fetch Metadata cross-site rejection, malformed JSON non-reflection and safe error/Host parsing tests.
