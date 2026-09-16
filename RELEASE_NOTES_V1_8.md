# SkillPass v1.8 — External Adoption & Evidence Release

v1.8 keeps the Capability Cell format and ownership model unchanged. It expands the product around external-provider adoption, portfolio verification, transfer evidence, and independently verifiable audit artifacts.

## Added

- Ed25519-signed authorization evidence with stable SHA-256 evidence hashes.
- Opaque-token evidence retrieval at `/api/evidence/{requestId}`.
- Batch Capability portfolio inspection at `/api/capability/status/batch` (maximum 10 outpoints).
- Per-Capability cross-provider acceptance metadata.
- Web UI provider acceptance matrix.
- Web UI signed-evidence export flow.
- Exportable post-transfer CKB lifecycle receipts.
- Expiry-soon warning for active service rights.
- `npm run provider:scaffold` clean-room external-provider kit generator.
- `npm run evidence:verify` offline authorization-evidence verifier.
- OpenAPI/discovery documentation for the new APIs.
- Dedicated evidence signing/rate-limit environment settings.

## Security properties

- Evidence access tokens are random and never stored in plaintext; only their SHA-256 digest is persisted.
- Evidence records contain hashes and authorization metadata, not the protected request body or service result.
- Evidence signatures are distinct from authorization itself: a valid evidence signature attests to a recorded decision but never substitutes for a fresh live Cell check.
- Existing Capability v1/v2 wire formats and on-chain transfer semantics are unchanged.

## Compatibility

No Capability migration is required. Existing issued Cells remain valid under the same provider policies. The new evidence APIs and UI are additive.
