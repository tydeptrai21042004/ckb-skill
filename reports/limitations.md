# Current Limitations — v1.0

1. The local demo remains deterministic simulation. Only the live/production path can provide real CKB/Fiber testnet evidence.
2. Public production is intentionally locked to CKB/Fiber **testnet**. This repo does not claim independent audit readiness for mainnet funds.
3. Real FNN E2E requires an operator-managed Fiber node with funded/routable payment state. The project never auto-funds channels or imports user keys.
4. The Capability Type Script still needs independent security audit before mainnet/economic production.
5. Capability v1 treats expiry as an access-layer rule; an expired Cell can remain ownable/transferable but is denied service use.
6. Burn/revocation policy Cells, delegated sub-agent authority and spending limits are not implemented in capability v1.
7. The local x402/Fiber compatibility layer is not claimed as a new upstream x402 standard; Fiber has its own evolving integration work.
8. `paymentPayload.payload.payer` is metadata, not a standalone human-identity proof. Authorization is anchored in the fresh CKB wallet signature and current live Capability Cell.
9. Production shared state now supports multiple SkillPass replicas on one Docker host, but the default Compose stack is still a **single-host failure domain**. Multi-host HA requires an external/HA load balancer plus PostgreSQL/Redis failover architecture.
10. PostgreSQL is a single container in the bundled Compose profile. For stricter RTO/RPO, use managed/replicated PostgreSQL with tested backups/failover.
11. Redis is intentionally ephemeral because it only stores short-lived nonce/rate-limit state. Redis restart can invalidate current challenges but must not lose payment/receipt data.
12. Delivery receipts may contain protected results and default to 24-hour retention. Operators must choose a privacy/retention policy appropriate to their service.
13. The benchmark does not model WAN latency, real CKB RPC/Fiber routing/payment confirmation, database contention, Caddy/TLS overhead or DDoS traffic. Run external load tests before setting capacity targets.
14. CKB RPC and FNN remain upstream availability dependencies. Production should use dedicated/private endpoints and monitor their latency/error rate.
15. Caddy/app resource limits are safe starting defaults, not universal capacity settings. Tune them from measured traffic.
16. Fiber is a fast-evolving network component; read release migration/backup notes before upgrading a live node.
17. No repository change can replace operational controls: off-host backups, monitoring/on-call, firewalling, secret rotation drills, patch management and independent review are still required.
