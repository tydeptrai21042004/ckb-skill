# Security Notes — v0.3

## Key custody

- The live API never needs or accepts a user's wallet private key or seed phrase.
- CKB issue/transfer transactions are signed through the connected CCC wallet.
- The local `TestWallet` is deterministic test code only.
- `run_all.sh --with-fiber` installs FNN but does not create/fund channels or import keys.

## Authorization rule

A protected paid request is authorized only when **all** required predicates hold:

```text
payment valid
AND payment not previously consumed
AND wallet challenge valid
AND referenced Capability Cell is live
AND Capability Type/identity matches
AND service + expiry policy matches
AND current Cell owner matches requester
```

Payment alone never grants capability access.

## Replay protection

- wallet challenge nonces are single-use and expiring;
- local x402/Fiber settlement hashes are single-use;
- file-backed payment replay state uses atomic temp-file rename for a single process;
- payment quotes are request-bound and expire from the local quote cache.

The file-backed replay store is **not a distributed lock**. Before running multiple replicas, use a shared store with atomic compare-and-set/unique-key semantics.

## Fiber/x402 compatibility boundary

`packages/x402-fiber` is explicitly experimental. The project does not claim its custom `ckb:fiber-*` scheme/network pair is an upstream registered x402 scheme. Track the official Fiber/x402 work and replace/adapt this harness when the upstream interface stabilizes.

## Crash/settlement boundary

The local demonstration authorizes service execution before persisting final local payment consumption. A production implementation must define idempotency and crash recovery so a service result cannot be delivered repeatedly around a failed settlement-state write.

## FNN RPC

For real FNN:

- bind RPC privately where possible;
- use the narrowest supported Biscuit/Bearer capability;
- never expose dev/admin RPC scopes to the public internet;
- treat payment/channel state as valuable operational state and back it up according to the active FNN release.

## Mainnet

Mainnet is not claimed ready. Complete independent Type Script/service review and real testnet acceptance first.

## Dependency reproducibility

- JavaScript dependency versions in the manifests are pinned exactly; once `npm install` succeeds, keep the generated `package-lock.json` files and use `npm ci` on subsequent runs.
- The contract pins Rust `1.95.0`, `ckb-std = 1.1.0`, and `ckb-testtool = 1.1.1` exactly.
- If `contracts/capability-type/Cargo.lock` is absent, `run_all.sh` generates it on the first Rust-enabled run. Commit/preserve that generated lockfile for release artifacts and use the same lockfile in CI/review builds.
- Review dependency updates deliberately; do not regenerate lockfiles as an incidental deployment step.
