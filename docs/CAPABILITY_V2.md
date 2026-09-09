# Capability v2: asset- and agent-bound service rights

Capability v2 is a backward-compatible extension of SkillPass' compact service-right model. V1 remains supported for ordinary holder-owned rights. V2 is intended for the narrower market where an external service right needs to follow or be checked against a transferable CKB subject such as an AI agent, Spore/DOB object, device, or custom asset.

## Data layout

V2 keeps the V1 identity fields and adds immutable commitments:

- `subjectType`: NONE, SPORE, DOB, AGENT, DEVICE, or CUSTOM.
- `bindingMode`: HOLDER, SUBJECT_OWNER, ATOMIC, or LICENSE.
- `subjectId`: 32-byte application-defined subject commitment.
- `policyHash`: 32-byte commitment to the commercial/authorization policy accepted at issuance.

The Capability Type Script keeps `(issuerId, capabilityId)` in args, so provider-issued singleton identity remains unchanged.

## Security semantics

`SUBJECT_OWNER` means providers must resolve the committed subject from fresh state and verify that the subject owner and Capability owner are the same. `ATOMIC` is intentionally fail-closed in the generic transfer builder: a subject-aware adapter must construct the co-transfer. The current Capability contract protects the V2 binding bytes from mutation, but does not pretend to understand every possible subject protocol. A production atomic adapter must validate the target subject protocol and co-transfer invariant.

This separation avoids hard-coding Spore, DOB, or one agent standard into the base Capability contract.

## Provider federation

`createProviderAcceptance()` models independent provider acceptance. A provider can publish its own accepted service IDs, entitlement IDs, issuer allowlist, subject types, and policy commitment without becoming the issuer of the Capability itself.

Cryptographic signing/verification of an acceptance document is adapter-specific and deliberately outside the compact Capability codec.

## Authorization order

A subject-aware provider should enforce:

1. Capability Cell is live.
2. Capability identity/issuer/service policy is valid.
3. Capability is active and not locally revoked when license mode applies.
4. Current requester controls the live Capability or presents valid bounded delegation.
5. For a bound V2 right, subject is live and `subject.owner == capability.owner`.
6. Per-use payment is checked only after entitlement succeeds.
7. Emit authorization evidence using hashes/IDs rather than raw request payloads.

Payment never creates entitlement.

## Why this exists

Normal SaaS entitlements are usually better served by a database/OpenFGA/Cerbos/Stigg-style system. SkillPass V2 is specifically for service rights whose ownership or verification needs to remain portable across assets, agents, providers, or organizations.
