# Funding evidence package

This document defines the evidence that must exist before a funding-candidate tag is described as a real CKB Testnet proof.

## Do not fabricate evidence

Example values, `REPLACE_*` values, mock Fiber receipts, Demo Mode state, screenshots without transaction identifiers, and local-only authorization logs are not substitutes for real Testnet evidence.

## Required provenance

Record the source commit, release tag, Node version, npm lockfile hash, Rust toolchain, `Cargo.lock` hash, exact contract build command/container, contract binary SHA-256, deployed Type Script identity, deployment transaction hash and output index.

## Required lifecycle

The public evidence must establish: issuance to Alice; Alice live outpoint; Provider A and Provider B ALLOW Alice; Bob DENY before transfer; real Alice-to-Bob CKB transaction; Alice old outpoint dead; Bob successor outpoint live; Capability identity/data/type invariants preserved; Alice DENY after transfer; Bob ALLOW after transfer; and confirmation/finality information for each authorization decision.

## Recommended repository layout

```text
evidence/testnet/
  manifest.json
  providers/
    provider-a-before.json
    provider-a-after.json
    provider-b-before.json
    provider-b-after.json
  rpc/
    issuance-cell.json
    alice-after-transfer.json
    bob-after-transfer.json
```

`manifest.json` is the public sanitized funding artifact. Use `manifest.local.json` only for temporary local collection. Never commit private keys, wallet seeds, auth tokens, database credentials, or signing private keys.

## Final verification

Before tagging a funding candidate, run:

```bash
./prepare-funding-release.sh
npm run evidence:testnet:require
npm run evidence:verify
```

A failed command means the corresponding funding claim is not yet ready to make.
