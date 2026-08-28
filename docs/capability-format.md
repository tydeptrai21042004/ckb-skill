# Capability Binary Format v1

The MVP uses a fixed **106-byte** payload. All offsets are byte offsets.

| Offset | Size | Field | Encoding |
|---:|---:|---|---|
| 0 | 1 | `version` | unsigned byte, must be `1` |
| 1 | 1 | `flags` | bits 0..2 only |
| 2 | 32 | `service_id` | opaque 32-byte identifier |
| 34 | 32 | `issuer_id` | issuer lock-script hash |
| 66 | 32 | `capability_id` | unique 32-byte capability identifier |
| 98 | 8 | `expiry` | unsigned Unix seconds, little-endian |

Flags:

- bit 0: transferable
- bit 1: delegatable (reserved for Phase 2)
- bit 2: revocable (reserved for Phase 2)

`service_id` is application-defined. This repository derives the demo service ID as SHA-256 of the UTF-8 service name so browser/Node code can reproduce it easily. It is **not** represented as a CKB script hash.

`issuer_id` is the CKB lock-script hash of the issuer. `capability_id` is also included in the Type Script args, which are exactly 64 bytes: `issuer_id || capability_id`. On fresh issuance it is not caller-selected: it is `CKB_HASH(serialized tx.inputs[0] || uint64_le(capability_output_index))`, following the CKB Type ID creation pattern. This makes each capability a singleton script group while keeping issuer authorization explicit.

Expiry policy: a pass is active only when `now_unix_seconds < expiry`. At `now == expiry`, it is expired. The Type Script permits ownership-preserving or transferable transitions after expiry; the protected service denies use after expiry. This avoids non-deterministic wall-clock logic inside the MVP Type Script.
