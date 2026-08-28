# Verification Matrix — v0.4

Status values: `NOT_STARTED`, `IMPLEMENTED`, `VERIFIED`, `BLOCKED`.

| Area | Deliverable | Test/action | Expected result | Current evidence | Status |
|---|---|---|---|---|---|
| Bootstrap | safe local setup | `npm run bootstrap` | templates created without destructive overwrite | automated script | VERIFIED |
| Auto-runner | OS/tool detection | `bash -n run_all.sh`, `./run_all.sh --help` | Linux/macOS/WSL path and local tool installs described | syntax/help checked | VERIFIED |
| Codec | 106-byte capability format | `npm test` | roundtrip/boundary/invalid cases pass | Node suite | VERIFIED |
| Browser codec | no Node Buffer dependency | `npm test` | browser-safe codec passes | explicit test | VERIFIED |
| Capability model | identity/transfer invariants | `npm test` | valid transfer, invalid mutations rejected | Node suite | VERIFIED |
| Local auth | owner/service/expiry/live-cell checks | `npm test` | only current valid owner succeeds | Node suite | VERIFIED |
| Wallet replay | one-time challenge | `npm test` | replay/expiry rejected | Node suite | VERIFIED |
| x402 transport | v2 header objects | `npm test` | encode/decode/required fields pass | Node suite | VERIFIED |
| Fiber payment model | unpaid/paid state | `npm run smoke:fiber` | unpaid rejected, paid accepted | deterministic smoke | VERIFIED |
| Payment replay | single consumption | `npm test` / `smoke:fiber` | reused payment rejected | persistent replay test | VERIFIED |
| Combined policy | payment AND capability | `npm run smoke:paid` | paid old owner denied after transfer | end-to-end local smoke | VERIFIED |
| Local HTTP UI | clickable flow | `npm run smoke:http` | app routes/functionality respond | automated smoke | VERIFIED |
| Local benchmark | verifier CPU path | `npm run benchmark` | report written | `reports/benchmarks/latest.md` | VERIFIED |
| CKB Type Script | Rust/ckb-testtool | `npm run verify:contract` | RISC-V contract cases pass | implemented; requires Rust runner | IMPLEMENTED |
| CCC client | typecheck | `npm run typecheck:ckb` | transaction/discovery helpers compile | implemented; npm install required | IMPLEMENTED |
| React/CCC frontend | production build | `npm run build:web` | Vite build succeeds | implemented; npm install required | IMPLEMENTED |
| CI | Node + contract jobs | GitHub Actions | clean runner passes | workflow added | IMPLEMENTED |
| Real CKB issuance | deployed Type Script + issue tx | wallet/testnet | real tx committed | no fabricated hash | NOT_STARTED |
| Real CKB transfer | A -> B live Cell | wallet/testnet | old Cell consumed, successor live | no fabricated hash | NOT_STARTED |
| Real FNN receiver | invoice RPC | FNN `new_invoice/get_invoice` | real invoice/payment observed | adapter implemented | NOT_STARTED |
| Real Fiber paid request | payer -> provider | funded testnet Fiber | real payment evidence + API success | requires topology/funds | NOT_STARTED |
| Public pilot | unrelated tester | public URL | independent reproduction | pending | NOT_STARTED |
