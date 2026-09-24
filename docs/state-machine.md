# Capability State Machine

This document is the protocol-facing lifecycle specification for the current SkillPass Capability Type Script. It describes the invariants enforced by the contract; application policy and provider authorization are layered on top.

## Issue

A new Capability has no group input and exactly one group output:

```text
Ø -> Capability(owner)
```

The Type Script requires:

1. output data is a valid Capability V1 or V2 payload;
2. `data.issuer_id == script_args[0..32]`;
3. `data.capability_id == script_args[32..64]`;
4. `capability_id == CKB_HASH(serialized tx.inputs[0] || uint64_le(capability_output_index))` according to CKB Type-ID creation semantics;
5. at least one transaction input is locked by the issuer lock hash.

Rule 4 gives each issuance fresh singleton identity. Rule 5 separates issuer authorization from the recipient lock: an issuer may fund/authorize creation while issuing the Capability directly to another owner.

## Transfer / same-owner refresh

A normal state transition has exactly one group input and one group output:

```text
Capability(Alice) -> Capability(Bob)
```

The complete Capability data payload must be byte-for-byte identical between input and output. This protects all V1 fields and, for V2, also protects the subject/binding/policy commitment fields.

Protected fields therefore include:

- version;
- flags;
- service ID;
- issuer ID;
- capability ID;
- expiry;
- V2 subject type;
- V2 binding mode;
- V2 subject ID;
- V2 policy hash.

Only the Cell lock may change. If input and output lock hashes differ, the `transferable` flag must be set. A same-owner refresh is permitted only while the Capability data remains identical.

## Invalid group shapes

The current contract accepts only:

```text
0 Capability inputs -> 1 Capability output   ISSUE
1 Capability input  -> 1 Capability output   TRANSFER / REFRESH
```

It rejects duplicate/split/merge shapes such as `0 -> 2`, `1 -> 2`, `2 -> 1`, and `2 -> 2`.

## Destruction

```text
Capability -> Ø
```

is rejected. Explicit on-chain burn/revocation semantics are not part of Phase 1. Application/provider suspension or revocation must not be confused with destruction of the canonical ownership Cell.

## Service authorization

The Capability Type Script protects lifecycle invariants. A provider separately authorizes a protected request by checking, in order:

1. a live Capability Cell is resolved;
2. the Cell uses the provider-accepted Capability Type Script deployment (`codeHash + hashType`);
3. Capability data decodes successfully;
4. Type args match the issuer/capability identity encoded in data;
5. the provider's confirmation/finality threshold is met;
6. issuer and service/entitlement policy are accepted;
7. the Capability is not expired;
8. V2 subject/policy binding rules are satisfied when configured;
9. the requester's proven lock hash equals the current live Capability Cell lock hash.

If canonical state cannot be resolved or validated, authorization fails closed. Payment, delegation, agent execution, and application-specific mutable state are extensions and are not part of the Phase-1 ownership state machine.
