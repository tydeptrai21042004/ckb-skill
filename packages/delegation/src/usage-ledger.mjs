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

function error(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export class LocalDelegationUsageLedger {
  #grants = new Map();

  constructor({ now = () => Date.now(), reservationTtlMs = 120_000 } = {}) {
    this.now = now;
    this.reservationTtlMs = Number(reservationTtlMs);
    if (!Number.isSafeInteger(this.reservationTtlMs) || this.reservationTtlMs < 10_000 || this.reservationTtlMs > 10 * 60_000) {
      throw new Error("delegation reservationTtlMs must be 10000..600000");
    }
  }

  #row(v) {
    let row = this.#grants.get(v.grantId);
    if (!row) {
      row = {
        expiresAt: v.expiresAt,
        usedCalls: 0,
        usedSpendAtomic: 0n,
        reservedCalls: 0,
        reservedSpendAtomic: 0n,
        invocations: new Map(),
      };
      this.#grants.set(v.grantId, row);
    }
    if (row.expiresAt !== v.expiresAt) throw error("delegation grantId collision detected", 403, "DELEGATION_GRANT_COLLISION");
    return row;
  }

  #assertActive(v) {
    if (this.now() >= v.expiresAt) throw error("delegation is expired", 403, "DELEGATION_EXPIRED");
  }

  #releaseReservation(row, invocation) {
    row.reservedCalls = Math.max(0, row.reservedCalls - 1);
    row.reservedSpendAtomic = row.reservedSpendAtomic >= invocation.spendAtomic
      ? row.reservedSpendAtomic - invocation.spendAtomic
      : 0n;
    invocation.status = "released";
    invocation.updatedAt = this.now();
  }

  #reclaimStaleReservation(row, invocation) {
    if (invocation.status !== "reserved") return false;
    if (this.now() - invocation.updatedAt < this.reservationTtlMs) return false;
    this.#releaseReservation(row, invocation);
    return true;
  }

  async reserve(input) {
    const v = normalized(input);
    this.#assertActive(v);
    const row = this.#row(v);
    let invocation = row.invocations.get(v.invocationKey);

    if (invocation && invocation.spendAtomic !== BigInt(v.spendAtomic)) {
      throw error("delegation invocation key collision detected", 403, "DELEGATION_INVOCATION_COLLISION");
    }
    if (invocation?.status === "committed") return this.#result(row, v, { replayed: true, status: "committed" });
    if (invocation?.status === "reserved" && !this.#reclaimStaleReservation(row, invocation)) {
      throw error("delegation invocation is already in progress", 409, "DELEGATION_INVOCATION_IN_PROGRESS");
    }

    const nextReservedCalls = row.reservedCalls + 1;
    const nextReservedSpend = row.reservedSpendAtomic + BigInt(v.spendAtomic);
    const effectiveCalls = row.usedCalls + nextReservedCalls;
    const effectiveSpend = row.usedSpendAtomic + nextReservedSpend;
    if (v.maxUses != null && effectiveCalls > v.maxUses) throw error("delegation use limit exhausted", 403, "DELEGATION_USE_LIMIT_EXHAUSTED");
    if (v.maxSpendAtomic != null && effectiveSpend > BigInt(v.maxSpendAtomic)) throw error("delegation spend limit exhausted", 403, "DELEGATION_SPEND_LIMIT_EXHAUSTED");

    row.reservedCalls = nextReservedCalls;
    row.reservedSpendAtomic = nextReservedSpend;
    invocation = { status: "reserved", spendAtomic: BigInt(v.spendAtomic), updatedAt: this.now() };
    row.invocations.set(v.invocationKey, invocation);
    return this.#result(row, v, { replayed: false, status: "reserved" });
  }

  async commit(input) {
    const v = normalized(input);
    this.#assertActive(v);
    const row = this.#row(v);
    const invocation = row.invocations.get(v.invocationKey);
    if (!invocation) throw error("delegation reservation not found", 409, "DELEGATION_RESERVATION_NOT_FOUND");
    if (invocation.spendAtomic !== BigInt(v.spendAtomic)) throw error("delegation invocation key collision detected", 403, "DELEGATION_INVOCATION_COLLISION");
    if (invocation.status === "committed") return this.#result(row, v, { replayed: true, status: "committed" });
    if (invocation.status !== "reserved") throw error("delegation reservation was released", 409, "DELEGATION_RESERVATION_RELEASED");

    row.reservedCalls = Math.max(0, row.reservedCalls - 1);
    row.reservedSpendAtomic = row.reservedSpendAtomic >= invocation.spendAtomic
      ? row.reservedSpendAtomic - invocation.spendAtomic
      : 0n;
    row.usedCalls += 1;
    row.usedSpendAtomic += invocation.spendAtomic;
    invocation.status = "committed";
    invocation.updatedAt = this.now();
    return this.#result(row, v, { replayed: false, status: "committed" });
  }

  async release(input) {
    const v = normalized(input);
    const row = this.#grants.get(v.grantId);
    if (!row) return null;
    if (row.expiresAt !== v.expiresAt) throw error("delegation grantId collision detected", 403, "DELEGATION_GRANT_COLLISION");
    const invocation = row.invocations.get(v.invocationKey);
    if (!invocation) return this.#result(row, v, { replayed: false, status: "missing" });
    if (invocation.spendAtomic !== BigInt(v.spendAtomic)) throw error("delegation invocation key collision detected", 403, "DELEGATION_INVOCATION_COLLISION");
    if (invocation.status === "reserved") this.#releaseReservation(row, invocation);
    return this.#result(row, v, { replayed: invocation.status === "committed", status: invocation.status });
  }

  // Backward-compatible atomic consume used by older integrations/tests.
  // New protected service flows should reserve before execution and commit only
  // after successful delivery/settlement.
  async consume(input) {
    const reserved = await this.reserve(input);
    if (reserved.status === "committed") return reserved;
    return this.commit(input);
  }

  #result(row, v, { replayed, status }) {
    const maxSpend = v.maxSpendAtomic == null ? null : BigInt(v.maxSpendAtomic);
    const effectiveSpend = row.usedSpendAtomic + row.reservedSpendAtomic;
    const effectiveCalls = row.usedCalls + row.reservedCalls;
    return Object.freeze({
      usedCalls: row.usedCalls,
      usedSpendAtomic: row.usedSpendAtomic.toString(),
      reservedCalls: row.reservedCalls,
      reservedSpendAtomic: row.reservedSpendAtomic.toString(),
      remainingUses: v.maxUses == null ? null : Math.max(0, v.maxUses - effectiveCalls),
      remainingSpendAtomic: maxSpend == null ? null : (maxSpend > effectiveSpend ? maxSpend - effectiveSpend : 0n).toString(),
      replayed: Boolean(replayed),
      status,
    });
  }

  async pruneExpired() {
    const now = this.now();
    let count = 0;
    for (const [key, row] of this.#grants) if (row.expiresAt <= now) { this.#grants.delete(key); count += 1; }
    return count;
  }
}
