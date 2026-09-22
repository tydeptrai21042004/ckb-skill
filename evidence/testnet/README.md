# CKB Testnet Evidence

This directory is for **real chain evidence only**. Do not replace transaction references with screenshots or simulated demo values.

## Required lifecycle

1. Deploy the exact Capability Type Script binary to CKB Testnet.
2. Issue one transferable Capability Cell to Alice.
3. Run both independent providers in the `before` phase: Alice must be allowed and Bob denied.
4. Submit the real CKB transfer transaction that consumes Alice's Capability Cell and creates the successor Cell under Bob's lock without changing the Capability Type/data.
5. Run both independent providers in the `after` phase: Alice must be denied and Bob allowed.
6. Preserve the manifest and provider reports in the funding evidence bundle.

## Manifest

Copy `manifest.example.json` to `manifest.json` and replace every placeholder with real Testnet data. `manifest.json` is intentionally gitignored so a release process can decide when to publish the final evidence snapshot.

The manifest records the contract deployment, issuer/service/capability IDs, issue and transfer transactions, pre/post outpoints, Alice/Bob lock hashes, source commit, and minimum confirmations.

## Automated RPC verification

```bash
CKB_RPC_URL=https://your-testnet-rpc.example npm run evidence:testnet:require
```

The verifier queries CKB RPC and checks that:

- the declared deployment outpoint resolves to the declared code hash;
- issue/transfer outputs use the accepted Capability Type Script;
- Capability Type/data are byte-identical across transfer;
- Capability issuer/service/capability IDs match the manifest;
- the transfer transaction consumes Alice's outpoint;
- the pre-transfer outpoint is no longer live;
- Bob's successor outpoint is live and sufficiently confirmed;
- the pre/post owner lock hashes match Alice/Bob.

Use `npm run evidence:testnet:shape` only for offline manifest-format checking. It is not funding evidence.

## Two independent providers

After `manifest.json` is complete:

```bash
npm run providers:init-testnet
export PROVIDER_A_CKB_RPC_URL=https://provider-a-rpc.example
export PROVIDER_B_CKB_RPC_URL=https://provider-b-rpc.example

# Run this before submitting the transfer transaction:
npm run providers:testnet:before

# Submit/confirm the Alice -> Bob CKB transfer, then:
npm run providers:testnet:after
```

The generated provider configs explicitly pin the deployment, trusted issuer, service ID and confirmation threshold. They declare `ownerSourceOfTruth: live-ckb-cell` and `entitlementDatabase: null`; each provider owns its own RPC setting and runs the same public `@skillpass/provider-verifier` path.

For subject-bound Capability V2 rights, wire each provider's independent subject resolver into its integration. The bundled lifecycle CLI intentionally refuses to fake subject resolution.
