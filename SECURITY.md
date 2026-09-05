# Security Notes — v0.6

## Key custody

- The live API never needs or accepts a user's wallet private key or seed phrase.
- CKB issue/transfer transactions are signed through the connected CCC wallet.
- The local `TestWallet` is deterministic test code only.
- `run_all.sh --with-fiber` pulls/checks the official Fiber Docker image but does not import keys, create/fund channels, or move assets.

## Authorization rule

A protected paid request is authorized only when **all** required predicates hold:

```text
payment valid (or an exact persisted crash-recovery settlement)
AND wallet challenge valid
AND referenced Capability Cell is live
AND Capability Type/identity matches
AND service + expiry policy matches
AND current Cell owner matches requester
```

Payment alone never grants capability access.

## Replay protection

- wallet challenge nonces are single-use and expiring;
- local x402/Fiber verification rejects consumed settlement hashes; `/settle` itself is idempotent and returns the existing receipt for the same validated payment;
- file-backed payment replay state uses atomic temp-file rename for a single process;
- payment quotes are request-bound, file-backed in the live profile, and expire from persistent service state;
- successful paid delivery receipts are persisted so a dropped HTTP response can be retried without consuming a second payment, and old receipts are pruned after the configured retention window;
- the persisted replay loader shares one in-flight load promise so concurrent first-use requests cannot bypass state loaded from disk.

The file-backed replay store is **not a distributed lock**. Before running multiple replicas, use a shared store with atomic compare-and-set/unique-key semantics.

## Fiber/x402 compatibility boundary

`packages/x402-fiber` is explicitly experimental. The project does not claim its custom `ckb:fiber-*` scheme/network pair is an upstream registered x402 scheme. Track the official Fiber/x402 work and replace/adapt this harness when the upstream interface stabilizes.

## Crash/settlement boundary

The live paid path follows verify → resource execution → settle → persist receipt → respond. The protected result is computed before payment consumption. Settlement is idempotent, and the service retains the request-bound quote until the successful delivery receipt is persisted; for this side-effect-free analyzer, a restart in the narrow post-settlement/pre-receipt window can recompute the result and recover the already-consumed settlement without charging again.

Delivery receipts default to 24-hour retention (`SERVICE_RECEIPT_TTL_SECONDS`) because they contain protected results. Secure the state volume and tune retention deliberately.

The remaining boundary is multi-process/distributed atomicity: the included JSON stores serialize writes only inside one process. Multiple replicas require a shared atomic store and explicit idempotency keys.

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


## Deployment security in v0.6

- `FACILITATOR_AUTH_TOKEN` should be a random secret; `deploy.sh init-testnet` generates one automatically.
- The testnet Compose stack does not publish the facilitator port externally and publishes SkillPass to loopback by default.
- The optional self-hosted Fiber profile publishes only FNN P2P port 8228. Its RPC is reachable only on the private Compose network.
- `fiber-init` refuses to overwrite an existing `.runtime/fiber-node/ckb/key`. It never generates, funds, or spends from a wallet.
- `.env.testnet`, `.env.live`, `.runtime/`, and `.tooling/` are gitignored and must not be included in release archives.
- `PAYMENTS_REQUIRED=true` does not make the system mainnet-ready; shared atomic nonce/replay storage and a full settlement/delivery idempotency design remain required before horizontal scaling.


## Payment proof modes

- `invoice-status` is the compatibility default: the trusted receiver-side Fiber node reports that the invoice is paid.
- `preimage` additionally requires a 32-byte payment preimage whose SHA-256 hash matches the invoice payment hash, and still checks receiver-side paid status.
- Payment preimages are sensitive operational proof material. Do not log them, store them in analytics, or expose them in error messages.
- The preimage mode is optional because upstream Fiber/x402 integration is still evolving.

## v0.8 web/XSS hardening

SkillPass v0.8 adds a shared HTTP-security layer and dedicated adversarial tests. Both frontends continue to avoid raw HTML sinks; the local demo additionally enforces Trusted Types. The live CCC frontend sends Trusted Types in report-only mode until the supported wallet matrix can be browser-tested. State-changing browser requests are JSON-only and reject `Sec-Fetch-Site: cross-site`. Route parsing no longer trusts the Host header, and public error strings are stripped of control/bidi characters and capped before response.

Run:

```bash
npm run test:security
npm run smoke:security-browser
```

See `BAO_MAT_XSS_VI.md` for the Vietnamese security/deployment checklist and tested XSS payload families.
