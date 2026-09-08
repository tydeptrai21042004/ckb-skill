function normalized(input) {
  const grantId = String(input?.grantId || "").trim().toLowerCase();
  const invocationKey = String(input?.invocationKey || "").trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(grantId)) throw new Error("delegation grantId is invalid");
  if (!/^[0-9a-f]{64}$/.test(invocationKey)) throw new Error("delegation invocationKey must be a SHA-256 hex digest");
  const maxUses = input.maxUses == null ? null : Number(input.maxUses);
  if (maxUses != null && (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 10_000)) throw new Error("delegation maxUses must be 1..10000");
  const atomic = (value, nullable = false) => {
    if (nullable && (value == null || value === "")) return null;
    const raw = String(value ?? "0");
    if (!/^[0-9]{1,78}$/.test(raw)) throw new Error("delegation atomic amount is invalid");
    return BigInt(raw).toString();
  };
  const maxSpendAtomic = atomic(input.maxSpendAtomic, true);
  const spendAtomic = atomic(input.spendAtomic);
  const expiresAt = Number(input.expiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error("delegation expiresAt is invalid");
  return { grantId, invocationKey, maxUses, maxSpendAtomic, spendAtomic, expiresAt };
}

export class LocalDelegationUsageLedger {
  #grants = new Map();
  constructor({ now = () => Date.now() } = {}) { this.now = now; }
  async consume(input) {
    const v = normalized(input);
    if (this.now() >= v.expiresAt) throw Object.assign(new Error("delegation is expired"), { status: 403, code: "DELEGATION_EXPIRED" });
    let row = this.#grants.get(v.grantId);
    if (!row) {
      row = { expiresAt: v.expiresAt, usedCalls: 0, usedSpendAtomic: 0n, invocations: new Set() };
      this.#grants.set(v.grantId, row);
    }
    if (row.expiresAt !== v.expiresAt) throw Object.assign(new Error("delegation grantId collision detected"), { status: 403, code: "DELEGATION_GRANT_COLLISION" });
    if (row.invocations.has(v.invocationKey)) return this.#result(row, v, true);
    const nextCalls = row.usedCalls + 1;
    const nextSpend = row.usedSpendAtomic + BigInt(v.spendAtomic);
    if (v.maxUses != null && nextCalls > v.maxUses) throw Object.assign(new Error("delegation use limit exhausted"), { status: 403, code: "DELEGATION_USE_LIMIT_EXHAUSTED" });
    if (v.maxSpendAtomic != null && nextSpend > BigInt(v.maxSpendAtomic)) throw Object.assign(new Error("delegation spend limit exhausted"), { status: 403, code: "DELEGATION_SPEND_LIMIT_EXHAUSTED" });
    row.usedCalls = nextCalls;
    row.usedSpendAtomic = nextSpend;
    row.invocations.add(v.invocationKey);
    return this.#result(row, v, false);
  }
  #result(row, v, replayed) {
    return Object.freeze({
      usedCalls: row.usedCalls,
      usedSpendAtomic: row.usedSpendAtomic.toString(),
      remainingUses: v.maxUses == null ? null : Math.max(0, v.maxUses - row.usedCalls),
      remainingSpendAtomic: v.maxSpendAtomic == null ? null : (BigInt(v.maxSpendAtomic) > row.usedSpendAtomic ? BigInt(v.maxSpendAtomic) - row.usedSpendAtomic : 0n).toString(),
      replayed,
    });
  }
  async pruneExpired() {
    const now = this.now();
    let count = 0;
    for (const [key, row] of this.#grants) if (row.expiresAt <= now) { this.#grants.delete(key); count += 1; }
    return count;
  }
}
