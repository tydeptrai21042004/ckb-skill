# SkillPass identifiers and commitments

This file defines interoperability rules for IDs that are carried as 32-byte Capability fields but whose source material is application-level text or policy data. Existing V1/V2 binary layouts do not change.

## Hash function

Use the CKB default Blake2b-256 hash (`ckb-default-hash`) for new SkillPass-native identifiers. Do not use an untagged hash of a display name.

## Service / entitlement IDs

For new integrations, derive a service ID from the exact UTF-8 bytes of:

```text
SKILLPASS_SERVICE_V1\0<namespace>/<slug>
```

Rules:

- `namespace` and `slug` are lowercase ASCII;
- allowed characters are `a-z`, `0-9`, `.`, `_`, and `-`;
- `/` occurs exactly once between namespace and slug;
- no surrounding whitespace;
- the NUL byte after the domain tag is literal byte `0x00`.

The 32-byte CKB hash of those bytes is stored as `serviceId`. Legacy/demo IDs remain valid if providers explicitly accept them; the base contract treats `serviceId` as opaque bytes.

## Policy commitments

A V2 `policyHash` commits to canonical policy bytes. New integrations should use RFC 8785 JSON Canonicalization Scheme (JCS), UTF-8 encoding, and the domain-separated preimage:

```text
SKILLPASS_POLICY_V1\0 || jcs(policyDocument)
```

The policy document MUST include a stable schema/version identifier. Providers must reject a required policy commitment when they cannot reproduce the exact canonical bytes.

## Why domain separation matters

Domain tags prevent the same raw bytes from being interpreted as both a service identifier and a policy commitment. They also make clean-room implementations easier to test with shared vectors.

## Compatibility

This specification does not change Capability V1/V2 encoding and does not invalidate already issued IDs. It defines the recommended derivation for new ecosystem-facing deployments.
