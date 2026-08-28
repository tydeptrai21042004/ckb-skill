# Verification Matrix — v0.2

Status values: `NOT_STARTED`, `IMPLEMENTED`, `VERIFIED`, `BLOCKED`.

| Task | Deliverable | Test command/action | Expected result | Current evidence | Status |
|---|---|---|---|---|---|
| B1 | reproducible repository | `npm run bootstrap` | config templates created without overwrite | script implemented | VERIFIED |
| B/local UX | interactive demo | `npm run dev` | browser UI loads | HTTP/UI smoke passes | VERIFIED |
| C1/C2 | 106-byte capability codec | `npm test` | roundtrip/boundaries/invalid data pass | Node suite | VERIFIED |
| C/browser | browser-safe codec | `npm test` | codec works with `globalThis.Buffer` removed | explicit test passes | VERIFIED |
| D1-D4 model | transition rules | `npm test` | identity + transferability invariants pass | Node suite | VERIFIED |
| D5 local | adversarial suite | `npm test` | all negative cases rejected | 31/31 Node tests | VERIFIED |
| D1-D5 on-chain | Rust Type Script + ckb-testtool | `npm run verify:contract` | RISC-V cases pass | not executed in current environment | IMPLEMENTED |
| D Docker | portable contract environment | `npm run verify:contract:docker` | Rust toolchain built in container; tests pass | Docker unavailable in current environment | IMPLEMENTED |
| Singleton identity | Type-ID-style creation ID | contract test | forged ID rejected | local duplicate test passes; Rust test included | IMPLEMENTED |
| F1 | CCC issue builder | real wallet | committed issue tx + derived ID | code implemented | IMPLEMENTED |
| F2 | live discovery | React/CCC app | owned capabilities derived from live chain | code implemented | IMPLEMENTED |
| F3 | transfer | React/CCC app | old Cell consumed; successor owned by recipient | code implemented | IMPLEMENTED |
| G1 | `paper-analyzer-v1` | `npm test` / UI | structured result + limits | local tests | VERIFIED |
| G2 local | live-cell authorization model | `npm test` | owner yes; stranger/expired/wrong/stale no | local tests | VERIFIED |
| G2 testnet | backend live Cell query | public testnet app | current owner only | live service implemented | IMPLEMENTED |
| G3 local | nonce/proof | `npm test` | replay + expiry rejected | local tests | VERIFIED |
| G3 testnet | CCC wallet challenge | live app | one-time signature accepted; replay rejected | frontend/backend implemented | IMPLEMENTED |
| H1 | capability list | React app | live capability cells shown | implementation present | IMPLEMENTED |
| H2 | issue UI | `ENABLE_PUBLIC_ISSUE=true` | explicit wallet-signed issue | implementation present | IMPLEMENTED |
| H3 | protected service UI | React app | owner succeeds | implementation present | IMPLEMENTED |
| H4 | transfer UI | React app | wallet preview/sign -> confirmed transfer | implementation present | IMPLEMENTED |
| H5 | one-container public app | `Dockerfile.live` | frontend + API from one service | implementation present; not built here | IMPLEMENTED |
| Local MVP | full two-user flow | `npm run verify` | A uses -> transfer -> A denied -> B uses | tests + HTTP smoke | VERIFIED |
| Testnet MVP | independent two-user flow | `HOW_TO_VERIFY.md` | access follows live CKB ownership | requires deployment + wallets | NOT_STARTED |
| E2 | testnet deployment | explorer | public contract deployment | pending real tx | NOT_STARTED |
| I1/I2 | unrelated tester | external reproduction | tester completes flow | pending | NOT_STARTED |
