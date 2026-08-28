# Capability State Machine

## Issue

A new capability has no group input and exactly one group output.

The Type Script requires:

1. output data is a valid v1 Capability payload;
2. `data.issuer_id == script_args[0..32]`;
3. `data.capability_id == script_args[32..64]`;
4. `capability_id == CKB_HASH(serialized tx.inputs[0] || uint64_le(capability_output_index))`;
5. at least one transaction input is locked by the issuer lock hash.

Rule 4 gives fresh issuance Type-ID-style singleton identity: the first input cannot be validly consumed twice. Rule 5 means issuance consumes/funds from an issuer-authorized input, so the issuer's normal lock script performs the signature authorization.

## Transfer / refresh

A normal state transition has exactly one group input and one group output.

Immutable fields must be byte-for-byte preserved:

- version;
- flags;
- service_id;
- issuer_id;
- capability_id;
- expiry.

If the input and output lock hashes differ, `transferable` must be true. If the lock hash is unchanged, a same-owner refresh is permitted as long as all CapabilityData bytes are unchanged.

## Destruction

MVP destruction is rejected: a group input with no group output fails. Explicit revocation/burn semantics are deferred to Phase 2.

## Service authorization

The backend accepts a call only when:

1. the referenced Cell is currently live;
2. the requested service ID matches;
3. the Cell is active (`now < expiry`);
4. the requester's proven lock hash equals the live Cell's lock hash;
5. the challenge nonce is valid and unused.
