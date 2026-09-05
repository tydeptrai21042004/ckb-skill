# Verification Matrix — v0.6

Status values: `NOT_STARTED`, `IMPLEMENTED`, `VERIFIED`, `BLOCKED_ENV`.

| Area | Deliverable | Test/action | Current evidence | Status |
|---|---|---|---|---|
| Local handoff | source-host-independent use | extract ZIP / run local commands | no GitHub connection required | VERIFIED |
| Bootstrap | safe local setup | `npm run bootstrap` / `./deploy.sh init-testnet` | templates present; non-destructive behavior | VERIFIED |
| Deploy helper | config validation | `bash -n deploy.sh`, `./deploy.sh doctor` | syntax passed; validation implemented | VERIFIED |
| Codec | capability serialization | `npm test` | roundtrip/boundary/invalid tests | VERIFIED |
| Browser-safe codec | no Node `Buffer` dependency | `npm test` | explicit browser-safe test | VERIFIED |
| Capability model | identity/transfer invariants | `npm test` | valid transfer + invalid mutations | VERIFIED |
| Local authorization | owner/service/expiry/live-state model | `npm test` | only valid current owner succeeds | VERIFIED |
| Wallet challenge | nonce replay/expiry | `npm test` | one-time/expiry tests | VERIFIED |
| Input safety | analysis text validation | `npm test` | empty/oversize rejected | VERIFIED |
| x402 transport | v2 header/requirements model | `npm test` | encode/decode/mismatch tests | VERIFIED |
| Fiber payment | unpaid/paid state | `npm run smoke:fiber` | unpaid reject -> paid verify -> settle | VERIFIED |
| Payment verification replay | consumed payment | `npm test`, `smoke:fiber` | `/verify` rejects replay | VERIFIED |
| Settlement recovery | idempotent settle | `npm test` | repeated valid settle returns existing receipt | VERIFIED |
| Persistent replay load | restart/concurrency | `npm test` | restart + first-load race regression | VERIFIED |
| Request binding | quote cannot buy different work | `npm run smoke:paid` | changed text rejected with binding mismatch | VERIFIED |
| Live service state | quote/receipt persistence | `npm test` | restart + prune tests | VERIFIED |
| Receipt privacy/size | bounded retention | `npm test` | configurable TTL prune regression | VERIFIED |
| Preimage proof | optional payment proof | `npm test` | required/mismatch/correct cases | VERIFIED |
| Combined policy | payment AND capability | `npm run smoke:paid` | paid old owner denied after transfer | VERIFIED |
| Local HTTP UI | clickable deterministic flow | `npm run smoke:http` | automated HTTP smoke | VERIFIED |
| Local benchmark | in-memory verifier CPU path | `npm run benchmark` | refreshed benchmark report | VERIFIED |
| Compose definitions | YAML syntax | PyYAML parse | all supplied Compose files parse | VERIFIED |
| CKB Type Script | Rust/ckb-testtool | `npm run verify:contract` | source present; Rust unavailable here | BLOCKED_ENV |
| CCC client | typecheck | `npm run typecheck:ckb` | dependencies could not complete install here | BLOCKED_ENV |
| React/CCC frontend | production build | `npm run build:web` | dependencies could not complete install here | BLOCKED_ENV |
| Docker runtime | image/health checks | `./deploy.sh demo/testnet` | Docker unavailable here | BLOCKED_ENV |
| Real CKB issuance | deployed Type Script + issue tx | wallet/testnet | no fabricated hash | NOT_STARTED |
| Real CKB transfer | Alice -> Bob live Cell | wallet/testnet | no fabricated hash | NOT_STARTED |
| Real FNN receiver | invoice RPC | real FNN | adapter implemented; no real payment in sandbox | NOT_STARTED |
| Real Fiber paid request | funded payer -> provider | testnet Fiber | requires actual topology/funds | NOT_STARTED |
| Public pilot | unrelated tester | public HTTPS URL | pending | NOT_STARTED |
