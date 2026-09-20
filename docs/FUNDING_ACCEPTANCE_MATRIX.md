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
| Care uses SkillPass rather than a second protocol | cross-repository compatibility check | Required |
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
