# Architecture

## Production-target architecture

```text
Browser / agent
   | explicit wallet signing
   v
CCC client --------------------------> CKB
   |                                  Capability Cell
   |                                  owner lock + Type Script
   |
   | HTTP request
   v
Resource server --402 requirement--> client/agent
   ^                                  |
   | PAYMENT-SIGNATURE                | Fiber payment
   |                                  v
   +---------------------------- Fiber / FNN
   |
   v
Payment verifier/facilitator
   |
   +--> payment valid + not consumed?
   |
   v
Capability verifier
   |
   +--> current live Cell?
   +--> correct script/identity?
   +--> correct service?
   +--> not expired?
   +--> current owner matches requester?
   |
   v
protected service
```

The payment and capability checks are intentionally **AND**, not OR:

```text
ALLOW = valid_payment && live_capability && current_owner && policy_valid
```

A payment is not an entitlement, and a capability does not waive a per-use payment requirement.

## Repository execution paths

1. **Deterministic local path** — Node built-ins plus an in-memory CKB-like chain and mock Fiber backend. This is reproducible in CI and tests codec, capability transition rules, challenge replay, payment replay, request binding, and A->B ownership transfer.
2. **Live CKB path** — Rust `ckb-std` Type Script plus CCC transaction/discovery helpers. This requires contract deployment and wallet/network access.
3. **FNN adapter path** — `packages/x402-fiber` can query a real FNN JSON-RPC receiver node. Real E2E payment still requires independently configured/funded Fiber payer/receiver topology.

The local compatibility facilitator is not presented as a replacement for the Nervos/Fiber x402 work. Its purpose is reproducibility and research isolation.
