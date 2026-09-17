# SkillPass Care source evidence

This note records the source-level evidence used by the Week 10 report. It is not a claim that the CKB production adapter is complete.

## Product and deployment evidence

- `README.md` describes SkillPass Care as portable service coverage that follows product ownership.
- `vercel.json`, `api/index.ts`, `api/[...path].ts`, and `api/router.ts` provide the Vercel/same-origin API deployment surface.
- `apps/web/` contains the product/reviewer UI.
- `apps/api/` contains the authenticated pilot API and public demo route layer.

## Core authorization / transition evidence

- `packages/core/` contains domain rules and shared transitions.
- `docs/ARCHITECTURE.md` defines the authorization invariant: active, unexpired entitlement; current owner match; accepted provider; remaining claim availability.
- The same architecture document describes `expectedVersion` optimistic mutation checks for the pilot API.

## Provider integration evidence

- `packages/provider-sdk/` contains the provider-facing verification helper.
- `docs/PROVIDER_INTEGRATION.md` documents provider integration boundaries.

## CKB honesty boundary

- `packages/ckb-adapter/` includes the CKB boundary.
- The repository explicitly states that the CKB adapter currently probes RPC health but fails closed for entitlement reads/writes until the live Cell schema, canonical live-Cell resolution, and wallet-signed state transitions are implemented.
- The public demo and memory-ledger pilot are therefore not represented as on-chain production transfers.

## Verification guidance

- `docs/HOW_TO_VERIFY.md` documents the Alice → Bob demo lifecycle, old-owner denial, new-owner verification, protected-read checks, and post-deploy Vercel smoke checks.
