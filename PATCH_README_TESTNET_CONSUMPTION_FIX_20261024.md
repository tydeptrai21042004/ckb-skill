# CKB Testnet consumption-status fix — changed files only

Apply this ZIP **on top of** `skillpass_debt_patch_changed_files_20261024.zip` / the corresponding committed repository state. Its files are relative to the repository root. Other code should remain unchanged.

## Why the GitHub Actions run failed

The previous runner waited for `get_live_cell(issueHash:0)` to report `dead`. Modern CKB RPC returns `unknown` for consumed Cells because `dead` is deprecated. A successful committed transfer can therefore time out at `awaitLive(..., false)` even though it spent the original Cell. The final `testnet-evidence.mjs` verifier had the same bug, so fixing only the first check would not resolve the full CI run.

## Changes

1. `scripts/spend-proof.mjs`: require **all** of `unknown`/legacy `dead`, a committed transfer, the exact consumed outpoint in its transaction inputs, and sufficient confirmations. `unknown` alone is never proof.
2. `scripts/ci-testnet-lifecycle.ts`: wait for this exact committed spend on **both** primary and secondary RPC endpoints, independently verify the new Bob Cell remains live, and retain `spend-proofs.json` in the Actions artifacts.
3. `scripts/testnet-evidence.mjs`: apply the same fail-closed rule to manifest validation, removing the deprecated `dead`-only assertion.
4. GitHub workflow `resume_run_id`: **read-only recovery** using an evidence artifact from an earlier failed run. This reuses the actual confirmed deployment / issuance / transfer and does **not** send another transaction or use wallet signing keys. It checks the old contract hash against the newly compiled ELF and verifies actual chain state on **two independent RPC nodes**, then performs the previously missed after-transfer provider policy checks.
5. New regression tests exercise consumed/unknown/live/missing/uncommitted/unrelated transaction cases and invalid recovery states. CI runs them before any transaction.

## Best path for your already-broadcast transfer: avoid spending more Testnet CKB

After committing this patch, open **Actions → Real CKB Testnet — Deploy + Lifecycle → Run workflow**. Enter your **previous FAILED GitHub Actions run ID** (the number in its `/actions/runs/<number>` URL) into **`resume_run_id`**, and leave `deployment_file` empty. The workflow downloads its `ckb-testnet-evidence-<previous-run-id>` artifact, revalidates the existing transactions and runs the post-transfer authorization checks.

This works if the failed run reached `status: transferred`, the `if: always()` artifact upload completed, the original byte-identical Capability ELF can still be built, and both RPC nodes can verify the transactions. On any mismatch, recovery stops without broadcasting another transaction.

If the original Actions artifact is unavailable, leave `resume_run_id` empty to run a **fresh** funded Testnet lifecycle. That creates new on-chain transactions. The old transfer is not shown to have failed merely because the previous guard timed out.

## Acceptance criteria

- Original deploy / issue / transfer hashes are retained in `manifest.json`.
- Old Cell is not live and an independently verified **committed** transfer consumes the exact original outpoint.
- Bob's successor Cell is **live** and has the same Capability data / Type Script.
- Both configured Testnet RPCs pass the new chain checks.
- Both provider policy processes pass the post-transfer authorization checks; stale Alice is rejected.
- GitHub Actions `evidence:testnet:require` and the complete workflow pass.

GitHub Actions results and artifacts **are the evidence**. This patch does not pretend that two CI subprocesses are independent external organizations or that the caller's wallet signature was demonstrated.

## Offline tests

```bash
npm run test:testnet-gates
npm run test:care-bridge
```

The focused offline suite (Care, provider checks, spend-proof and manifest-recovery tests) passed 29/29 in the patch authoring environment. Actual live RPC recovery and GitHub Actions execution must still occur in your repository.
