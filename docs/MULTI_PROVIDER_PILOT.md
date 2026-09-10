# Multi-provider Service Bundle pilot

This pilot demonstrates SkillPass's primary use case: one CKB Service Bundle right is accepted independently by three different service providers. The providers do **not** share an entitlement database. Each verifies the current live Capability Cell and applies its own service policy.

## Providers

| Local endpoint | Provider | Service |
| --- | --- | --- |
| `http://127.0.0.1:8811` | Model Provider A | Model API |
| `http://127.0.0.1:8812` | Private Data Provider B | Private Data API |
| `http://127.0.0.1:8813` | Compute Provider C | Compute API |

The built-in handlers perform real deterministic work so the pilot remains dependency-free. Production providers can replace them with HTTPS upstreams. Side-effecting upstreams are allowed only with the explicit `idempotent-action` + `invocation-key` contract.

## 1. Configure testnet

Copy `.env.testnet.example` to `.env.testnet` and set the deployed Capability Type code hash, dependency outpoint, and trusted issuer lock hash. Do not commit `.env.testnet`.

## 2. Start three independent providers

```bash
npm run pilot:up
```

The Compose file starts three separate SkillPass processes, each with local process state and exactly one enabled service. There is no shared PostgreSQL or Redis instance in this pilot; CKB is the common ownership source.

## 3. Verify provider independence

```bash
npm run pilot:check
```

Expected: three different provider IDs, three different single-service manifests, and `entitlementSynchronizationRequired=false`.

## 4. Prove current ownership convergence

After issuing a Service Bundle Capability, pass its current outpoint:

```bash
node scripts/pilot-check.mjs --outpoint 0x<tx-hash>:0x0
```

Each provider independently calls live CKB state. The check fails if the providers disagree about Capability identity or current owner lock hash.

## 5. Demonstrate transfer

1. Invoke all three services as the current owner using the normal SkillPass wallet flow.
2. Create a bounded delegation and demonstrate delegated access if desired.
3. Transfer the Capability Cell to a second wallet.
4. Use the **new** live outpoint with `pilot-check.mjs`; all three providers must agree on the new owner.
5. Retry the previous owner's/delegate's protected requests with fresh challenges. They must be rejected because the previous Capability outpoint was consumed and ownership changed.

The key measurement is **provider-side entitlement ownership updates: zero**. The providers do not coordinate a customer-account migration; they independently converge on the CKB Cell owner.

## 6. Stop the pilot

```bash
npm run pilot:down
```

For a production deployment, use the normal shared-state production stack. This pilot deliberately isolates providers to prove the cross-provider ownership claim; it is not the high-availability production topology.
