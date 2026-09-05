# SkillPass v0.7 — Portable CKB Service Rights + Fiber/x402 Payments

SkillPass is a research/product prototype for **portable digital service rights on CKB**.
A provider issues a capability as a CKB Cell. The current live Cell owner is authorized to use the protected service. A valid transfer moves that authorization to the new owner without updating a centralized entitlement row.

v0.7 keeps that second condition and adds a production-oriented frontend for both the local simulator and real CCC/testnet workflow. The CKB + x402/Fiber path remains cross-platform across Windows/Linux/macOS: a service request may also require an **x402-v2-style payment completed over Fiber**. Payment never replaces authorization: the request must satisfy both the payment rule and the current CKB capability rule.

## Tài liệu tiếng Việt

- [`TRIEN_KHAI_NHANH_VI.md`](TRIEN_KHAI_NHANH_VI.md) — triển khai nhanh trực tiếp từ ZIP.

- **Triển khai từng bước:** [`HUONG_DAN_TRIEN_KHAI.md`](HUONG_DAN_TRIEN_KHAI.md)
- **Cách dùng ứng dụng:** [`HUONG_DAN_SU_DUNG.md`](HUONG_DAN_SU_DUNG.md)
- **Kiến trúc + bảo mật:** [`KIEN_TRUC_VA_BAO_MAT_VI.md`](KIEN_TRUC_VA_BAO_MAT_VI.md)
- **Xử lý lỗi:** [`XU_LY_LOI_VI.md`](XU_LY_LOI_VI.md)
- **Ghi chú cộng đồng CKB/Fiber:** [`docs/CONG_DONG_CKB_FIBER_VI.md`](docs/CONG_DONG_CKB_FIBER_VI.md)
- **Tóm tắt thay đổi v0.6:** [`THAY_DOI_V0.6.md`](THAY_DOI_V0.6.md)
- **Giao diện v0.7:** [`GIAO_DIEN_V0.7.md`](GIAO_DIEN_V0.7.md) — phân biệt local simulator và CCC/testnet frontend.

## Developer quick start

For most contributors, use the stable root commands instead of running files inside `apps/` directly:

```bash
npm run setup
npm run dev
```

Open `http://127.0.0.1:8787/`. Before committing, run `npm run check`.

For the most reproducible handoff, Docker is a second supported entry point:

```bash
docker compose -f deploy/compose.demo.yaml up --build
```

See [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

```text
user / AI agent
     |
     | HTTP request
     v
x402-style 402 challenge ----> Fiber invoice/payment
     |                              |
     | PAYMENT-SIGNATURE            v
     +------------------------> payment verification
                                    |
                                    v
                            SkillPass verifier
                               |          |
                               |          +--> payment not replayed
                               v
                       current CKB live Cell
                               |
                         current owner?
                               |
                               v
                         protected service
```

## Important research positioning

The **Fiber x402 facilitator itself is not claimed as SkillPass novelty**. Nervos/Fiber has an official agent-payment design and an x402 facilitator MVP draft/PR. SkillPass uses a small compatibility harness so the repository is independently reproducible, while the actual research question is:

> Can a provider-authorized service right remain portable and independently verifiable from CKB state while high-frequency payment is handled by Fiber/x402, without restoring a provider-owned entitlement database?

See [`docs/research-gap-and-funding.md`](docs/research-gap-and-funding.md).

## Fastest deployment

If you only want a working reviewer/demo instance and already have Docker:

**Windows:**

```bat
deploy.cmd demo
```

**Linux / macOS / WSL:**

```bash
chmod +x deploy.sh
./deploy.sh demo
```

For real CKB testnet configuration:

```bash
./deploy.sh init-testnet
# fill/import real contract deployment metadata
./deploy.sh doctor
./deploy.sh testnet
```

For an optional self-hosted official Fiber node:

```bash
./deploy.sh fiber-init /secure/path/to/ckb-private-key
./deploy.sh testnet-fiber
```

`fiber-init` never funds the key or opens channels. Windows users can run the same deployment flow through `deploy.cmd`/`deploy.ps1`. See [`HUONG_DAN_TRIEN_KHAI.md`](HUONG_DAN_TRIEN_KHAI.md) for Vietnamese instructions, [`DEPLOY_STEP_BY_STEP.md`](DEPLOY_STEP_BY_STEP.md) for the English local-ZIP runbook, and [`DEPLOY.md`](DEPLOY.md) for the compact reference.

## Operator usability

After deployment, the web UI reads `/api/status` and shows CKB/Fiber readiness instead of making users guess whether dependencies are online. Useful operations include:

```bash
./deploy.sh smoke testnet
./deploy.sh backup-state testnet
npm run support
```

On Windows, replace `./deploy.sh` with `deploy.cmd`. `backup-state` exports only SkillPass/facilitator application state; it deliberately excludes `.env.testnet`, private keys, and live Fiber channel storage. `npm run support` creates `.runtime/support-bundle.json` with diagnostic metadata while excluding secret values.

## One-command setup + verification

On Linux, macOS, or WSL:

```bash
chmod +x run_all.sh
./run_all.sh
```

`run_all.sh` detects the OS/CPU and then:

1. uses system Node.js when it is >=22, otherwise downloads a portable Node 22 into `.tooling/`;
2. installs a local Rust toolchain pinned by this project and the CKB RISC-V target;
3. installs the isolated npm dependencies for the CCC client, React app, and live service;
4. bootstraps safe config templates;
5. runs the complete Node test suite;
6. runs the basic HTTP smoke test;
7. runs the x402/Fiber facilitator smoke test;
8. runs the combined **payment + capability + transfer** smoke test;
9. type-checks the CCC client;
10. builds the React/CCC frontend;
11. writes a benchmark report;
12. builds/tests the CKB Type Script.

Useful variants:

```bash
./run_all.sh --no-rust        # fastest JS/local verification
./run_all.sh --serve          # verify everything, then open local demo on :8787
./run_all.sh --with-offckb    # also install OffCKB locally
./run_all.sh --with-fiber     # also pull/check the official Fiber v0.9.0 Docker image
./run_all.sh --skip-install   # reuse already-installed dependencies
```

`--with-fiber` only pulls/checks the official Fiber Docker image. It deliberately does **not** import wallet keys, create/fund channels, or move assets.

## Local product demo

```bash
npm run dev
```

Open `http://127.0.0.1:8787/`.

For the real CCC/testnet development UI, run `npm run dev:web` after setup/configuration. It starts the live API and Vite frontend together; use `npm run dev:frontend-only` only when you already have an API backend running.

The UI supports both:

- capability-only access; and
- a local mock of `402 -> Fiber payment -> retry -> capability authorization`.

The deterministic combined smoke test proves:

```text
402 quote
  -> unpaid request rejected
  -> payment marked paid
  -> quote reuse with changed protected input is rejected
  -> Alice paid access succeeds
  -> same payment replay rejected
  -> capability transferred Alice -> Bob
  -> Alice can pay but is still rejected as NOT_OWNER
  -> Bob pays with a fresh quote and succeeds
```

This is **simulation evidence**, not a claim of a real Fiber payment or CKB testnet deployment.

## Agent/tool discovery

A deployed live service publishes machine-readable, read-only metadata so an AI agent or integration can understand the authorization and payment boundary without scraping the UI:

- `GET /.well-known/skillpass.json` — SkillPass capability, wallet-authentication, health and payment metadata.
- `GET /api/openapi.json` — minimal OpenAPI 3.1 contract for status, challenge and protected analysis calls.

Neither document contains wallet private keys, facilitator bearer tokens, Fiber node keys, or private environment values. The discovery document explicitly states that signing remains in the user's wallet.

## Current automated evidence

The dependency-free Node path currently contains **50 tests** plus three HTTP/integration smoke paths. The local benchmark writes results to `reports/benchmarks/latest.md`.

Run:

```bash
npm test
npm run smoke:http
npm run smoke:fiber
npm run smoke:paid
npm run benchmark
```

For the complete environment:

```bash
npm run verify:full
```

## Real CKB/Fiber path

The live CKB path uses **CCC** for wallet/transaction integration and the Rust CKB Type Script for capability invariants. The Fiber adapter uses FNN JSON-RPC (`new_invoice`, `get_invoice`, etc.).

Start with `./deploy.sh init-testnet`, then `./deploy.sh doctor`. The live service now supports the real paid path directly: it preflights current capability ownership, returns an x402 v2 `402`, verifies Fiber payment through the facilitator, verifies the signed CKB challenge and live Cell again, computes the protected result, persists settlement/delivery state, and only then returns the response. Payment quotes and bounded delivery receipts survive service restarts in the single-process deployment profile; settlement is idempotent so an already-consumed invoice can recover the same delivery path after a crash without a second charge.

For a local FNN receiver endpoint:

```bash
FIBER_BACKEND=fnn \
FIBER_RPC_URL=http://127.0.0.1:8227 \
npm run facilitator
```

A real paid E2E requires funded Fiber peers/channels. It is intentionally not auto-created by `run_all.sh` because that is a network/asset operation.

See [`DEPLOY_STEP_BY_STEP.md`](DEPLOY_STEP_BY_STEP.md), [`DEPLOY.md`](DEPLOY.md), and [`HOW_TO_VERIFY.md`](HOW_TO_VERIFY.md).

## Capability data

Fixed 106-byte v1 layout:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | version |
| 1 | 1 | flags |
| 2 | 32 | service ID |
| 34 | 32 | issuer lock-script hash |
| 66 | 32 | capability ID |
| 98 | 8 | expiry, unsigned LE Unix seconds |

Type Script args:

```text
issuer_id || capability_id
```

Creation uses a Type-ID-style identity:

```text
CKB_HASH(serialized first CellInput || uint64_le(capability_output_index))
```

The transfer keeps capability identity/service/issuer/expiry/flags immutable while ownership moves via the Cell lock.

## Repository layout

```text
apps/demo-service/           local clickable API/UI and combined paid-access demo
apps/fiber-facilitator/      small x402/Fiber compatibility server (mock or FNN RPC)
apps/web/                    React + CCC real-CKB frontend
apps/live-service/           live CKB + x402/Fiber protected-service backend
contracts/capability-type/   CKB Rust Type Script + ckb-testtool tests
packages/capability-codec/   browser/server 106-byte codec
packages/protocol-core/      deterministic capability transition rules
packages/verifier/           ownership + challenge/replay verification model
packages/ckb-client/         CCC issue/discovery/transfer/live-cell helpers
packages/x402-fiber/         experimental x402-v2/Fiber compatibility layer
deploy/                      Docker Compose demo/testnet/Fiber profiles
deploy.sh                     one-command deployment/doctor/log/status helper
scripts/                     bootstrap, smoke, benchmark, release, verification
docs/                        protocol + ecosystem research + local/deployment documentation
reports/                     benchmark, limits, verification matrix
```

## External technical references

- CCC: https://github.com/ckb-devrel/ccc
- Fiber: https://github.com/nervosnetwork/fiber
- Fiber agent/x402 design: https://github.com/nervosnetwork/fiber/issues/1255
- Fiber x402 facilitator draft: https://github.com/nervosnetwork/fiber/pull/1301
- x402 v2 specification: https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md

## Claim boundary

This repository is a **funding/research-ready prototype**, not a production-security certification. Do not label it mainnet-ready until the Type Script is independently reviewed, real CKB/Fiber transactions are published, real replay/state storage is productionized, and unrelated users reproduce the flow.

## Security regression checks

SkillPass includes dedicated XSS/browser-request regression tests in addition to the protocol/payment suite:

```bash
npm run test:security
npm run smoke:security-browser
# or both:
npm run verify:security
```

The security suite rejects raw DOM injection sinks, tests common HTML/SVG/URL XSS payloads through the HTTP API, verifies CSP and JSON-only mutation handling, and checks cross-site browser request rejection. See `BAO_MAT_XSS_VI.md` for the Vietnamese security guide.
