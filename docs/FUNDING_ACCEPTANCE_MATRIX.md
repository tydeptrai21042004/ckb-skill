# Funding Acceptance Matrix

| Proposal claim | Machine/verifiable evidence | Required status before final submission |
|---|---|---|
| Capability is transferable | Type Script tests + real Alice->Bob Testnet tx | Required |
| Old owner loses authority | fresh provider decision after consumed outpoint | Required |
| New owner gains authority | fresh provider decision against Bob live Cell | Required |
| Providers are independent | separate IDs, keys, policies, runtime state | Required |
| No shared owner DB | provider config/runtime inspection + live CKB resolution | Required |
| Issuer/service policy is enforced | negative wrong-issuer/service tests | Required |
| Replay/tampering is rejected | request-hash + nonce/idempotency tests | Required |
| Care uses SkillPass for portable ownership while retaining its own coverage lifecycle | integration profile + cross-repository compatibility check | Required |
| Care coverage survives ownership transfer | Provider A service before transfer + same quota/history after Bob successor Cell | Required for Care reference milestone |
| Cross-provider service continuity works | Provider A service for Alice then Provider B service for Bob against same Care coverage | Required for Care reference milestone |
| Stale Care service cannot race a transfer | service-event commit rejects evidence referencing consumed Capability outpoint | Required for Care reference milestone |
| Demo is not mislabeled as chain activity | explicit mode labels and evidence links | Required |
| External integration is plausible | external provider/developer integration log | Required for validation milestone |
| User problem exists | small provider/buyer interview report | Required for validation milestone |

## Evidence manifest fields

Every real-chain evidence bundle should record:

```text
network
sourceCommit
protocolVersion
contractCodeHash/hashType
contract dep outpoint
issuerId
serviceId
capabilityId
issueTxHash
preTransferOutpoint
transferTxHash
postTransferOutpoint
Alice lock / Bob lock identifiers
provider A evidence hash
provider B evidence hash
verification timestamp/block
```

Do not substitute screenshots for machine-readable transaction references.
