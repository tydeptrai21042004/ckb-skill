import { createHash, randomBytes } from "node:crypto";

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (m) => `\\${m}`);
}

export class PostgresRecordStore {
  constructor({ pool, namespace = "default", now = () => Date.now() } = {}) {
    if (!pool) throw new Error("PostgresRecordStore requires pool");
    if (!/^[a-z0-9_.:-]{1,64}$/i.test(namespace)) throw new Error("record namespace is invalid");
    this.pool = pool;
    this.namespace = namespace;
    this.now = now;
  }

  async get(key) {
    const normalized = String(key);
    const { rows } = await this.pool.query(
      `SELECT value, extract(epoch from updated_at) * 1000 AS updated_ms
         FROM skillpass_service_records
        WHERE namespace = $1 AND record_key = $2
          AND (expires_at IS NULL OR expires_at > clock_timestamp())`,
      [this.namespace, normalized],
    );
    if (!rows.length) return null;
    return { key: normalized, updatedAt: Math.trunc(Number(rows[0].updated_ms)), ...rows[0].value };
  }

  async has(key) { return (await this.get(key)) !== null; }

  async set(key, value = {}) {
    const normalized = String(key);
    const body = { ...value };
    delete body.key;
    delete body.updatedAt;
    const expiresAt = Number.isFinite(Number(body.expiresAt)) ? Number(body.expiresAt) : null;
    await this.pool.query(
      `INSERT INTO skillpass_service_records(namespace, record_key, value, expires_at, updated_at)
       VALUES ($1, $2, $3::jsonb, CASE WHEN $4::bigint IS NULL THEN NULL ELSE to_timestamp($4::double precision / 1000.0) END, clock_timestamp())
       ON CONFLICT (namespace, record_key) DO UPDATE
       SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at, updated_at = clock_timestamp()`,
      [this.namespace, normalized, JSON.stringify(body), expiresAt],
    );
    return this.get(normalized);
  }

  async delete(key) {
    const result = await this.pool.query(
      "DELETE FROM skillpass_service_records WHERE namespace = $1 AND record_key = $2",
      [this.namespace, String(key)],
    );
    return result.rowCount > 0;
  }

  async pruneExpiredByExpiresAt(prefix, nowMs = this.now()) {
    const result = await this.pool.query(
      `DELETE FROM skillpass_service_records
        WHERE namespace = $1 AND record_key LIKE $2 ESCAPE '\\'
          AND expires_at IS NOT NULL
          AND expires_at <= to_timestamp($3::double precision / 1000.0)`,
      [this.namespace, `${escapeLike(prefix)}%`, Number(nowMs)],
    );
    return result.rowCount;
  }

  async pruneUpdatedBefore(prefix, beforeMs) {
    const result = await this.pool.query(
      `DELETE FROM skillpass_service_records
        WHERE namespace = $1 AND record_key LIKE $2 ESCAPE '\\'
          AND updated_at <= to_timestamp($3::double precision / 1000.0)`,
      [this.namespace, `${escapeLike(prefix)}%`, Number(beforeMs)],
    );
    return result.rowCount;
  }

  async listPrefix(prefix, { limit = 100 } = {}) {
    const boundedLimit = Number.isSafeInteger(Number(limit)) ? Math.max(1, Math.min(500, Number(limit))) : 100;
    const normalizedPrefix = String(prefix || "");
    const { rows } = await this.pool.query(
      `SELECT record_key, value, extract(epoch from updated_at) * 1000 AS updated_ms
         FROM skillpass_service_records
        WHERE namespace = $1 AND record_key LIKE $2 ESCAPE '\\'
          AND (expires_at IS NULL OR expires_at > clock_timestamp())
        ORDER BY updated_at DESC
        LIMIT $3`,
      [this.namespace, `${escapeLike(normalizedPrefix)}%`, boundedLimit],
    );
    return rows.map((row) => ({ key: row.record_key, updatedAt: Math.trunc(Number(row.updated_ms)), ...row.value }));
  }

  async size() {
    const { rows } = await this.pool.query(
      "SELECT count(*)::bigint AS count FROM skillpass_service_records WHERE namespace = $1",
      [this.namespace],
    );
    return Number(rows[0].count);
  }
}

export class PostgresReplayStore {
  constructor({ pool } = {}) {
    if (!pool) throw new Error("PostgresReplayStore requires pool");
    this.pool = pool;
  }

  async get(key) {
    const normalized = String(key).toLowerCase();
    const { rows } = await this.pool.query(
      `SELECT metadata, extract(epoch from consumed_at) * 1000 AS consumed_ms
         FROM skillpass_payment_consumptions WHERE payment_hash = $1`,
      [normalized],
    );
    if (!rows.length) return null;
    return { key: normalized, consumedAt: Math.trunc(Number(rows[0].consumed_ms)), ...rows[0].metadata };
  }

  async has(key) { return (await this.get(key)) !== null; }

  async consume(key, metadata = {}) {
    const normalized = String(key).toLowerCase();
    const result = await this.pool.query(
      `INSERT INTO skillpass_payment_consumptions(payment_hash, metadata, consumed_at)
       VALUES ($1, $2::jsonb, clock_timestamp())
       ON CONFLICT (payment_hash) DO NOTHING
       RETURNING payment_hash`,
      [normalized, JSON.stringify(metadata)],
    );
    return result.rowCount === 1;
  }
}


export class PostgresChallengeStore {
  constructor({ pool, ttlMs = 60_000, now = () => Date.now() } = {}) {
    if (!pool) throw new Error("PostgresChallengeStore requires pool");
    this.pool = pool;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  async issue(identity, buildMessage) {
    if (typeof identity !== "string" || identity.length === 0) throw new Error("identity must be non-empty");
    if (typeof buildMessage !== "function") throw new Error("buildMessage is required");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const nonce = randomBytes(24).toString("hex");
      const expiresAt = this.now() + this.ttlMs;
      const message = buildMessage({ nonce, identity, expiresAt });
      const result = await this.pool.query(
        `INSERT INTO skillpass_challenges(nonce, identity, message, expires_at)
         VALUES ($1, $2, $3, to_timestamp($4::double precision / 1000.0))
         ON CONFLICT (nonce) DO NOTHING`,
        [nonce, identity, message, expiresAt],
      );
      if (result.rowCount === 1) return Object.freeze({ nonce, message, expiresAt });
    }
    throw new Error("could not allocate a unique challenge nonce");
  }

  async consume({ nonce, identity }) {
    const normalized = String(nonce || "");
    const { rows } = await this.pool.query(
      `DELETE FROM skillpass_challenges
        WHERE nonce = $1
        RETURNING identity, message, extract(epoch from expires_at) * 1000 AS expires_ms`,
      [normalized],
    );
    if (!rows.length) {
      throw Object.assign(new Error("challenge nonce not found or already used"), { status: 401, code: "UNKNOWN_OR_REPLAYED_NONCE" });
    }
    const entry = rows[0];
    if (this.now() >= Number(entry.expires_ms || 0)) {
      throw Object.assign(new Error("challenge expired"), { status: 401, code: "EXPIRED_NONCE" });
    }
    if (entry.identity !== identity) {
      throw Object.assign(new Error("challenge address mismatch"), { status: 401, code: "ADDRESS_MISMATCH" });
    }
    return Object.freeze({ message: entry.message, expiresAt: Math.trunc(Number(entry.expires_ms)) });
  }
}

export class PostgresRateLimiter {
  constructor({ pool, now = () => Date.now() } = {}) {
    if (!pool) throw new Error("PostgresRateLimiter requires pool");
    this.pool = pool;
    this.now = now;
    this.cleanupCounter = 0;
  }

  async consume(subject, { limit = 90, windowMs = 60_000 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("rate limit must be a positive integer");
    if (!Number.isSafeInteger(windowMs) || windowMs < 100) throw new Error("rate window must be >=100ms");
    const now = this.now();
    const window = Math.floor(now / windowMs);
    const hash = createHash("sha256").update(String(subject || "unknown")).digest("hex").slice(0, 32);
    const key = `${windowMs}:${window}:${hash}`;
    const resetAt = (window + 1) * windowMs;
    const { rows } = await this.pool.query(
      `INSERT INTO skillpass_rate_limits(rate_key, count, reset_at, updated_at)
       VALUES ($1, 1, to_timestamp($2::double precision / 1000.0), clock_timestamp())
       ON CONFLICT (rate_key) DO UPDATE
       SET count = skillpass_rate_limits.count + 1, updated_at = clock_timestamp()
       RETURNING count, extract(epoch from reset_at) * 1000 AS reset_ms`,
      [key, resetAt],
    );

    this.cleanupCounter += 1;
    if (this.cleanupCounter >= 100) {
      this.cleanupCounter = 0;
      void this.pool.query(
        "DELETE FROM skillpass_rate_limits WHERE reset_at < clock_timestamp() - interval '10 minutes'",
      ).catch(() => {});
      void this.pool.query(
        "DELETE FROM skillpass_challenges WHERE expires_at < clock_timestamp() - interval '10 minutes'",
      ).catch(() => {});
    }

    const count = Number(rows[0]?.count || 0);
    const storedResetAt = Number(rows[0]?.reset_ms || resetAt);
    return {
      allowed: count <= limit,
      count,
      limit,
      retryAfterSeconds: Math.max(1, Math.ceil((storedResetAt - now) / 1000)),
    };
  }
}

export class RedisChallengeStore {
  constructor({ client, ttlMs = 60_000, prefix = "skillpass:challenge:", now = () => Date.now() } = {}) {
    if (!client) throw new Error("RedisChallengeStore requires client");
    this.client = client;
    this.ttlMs = ttlMs;
    this.prefix = prefix;
    this.now = now;
  }

  async issue(identity, buildMessage) {
    if (typeof identity !== "string" || identity.length === 0) throw new Error("identity must be non-empty");
    if (typeof buildMessage !== "function") throw new Error("buildMessage is required");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const nonce = randomBytes(24).toString("hex");
      const expiresAt = this.now() + this.ttlMs;
      const message = buildMessage({ nonce, identity, expiresAt });
      const value = JSON.stringify({ identity, message, expiresAt });
      const result = await this.client.set(`${this.prefix}${nonce}`, value, { PX: this.ttlMs, NX: true });
      if (result === "OK") return Object.freeze({ nonce, message, expiresAt });
    }
    throw new Error("could not allocate a unique challenge nonce");
  }

  async consume({ nonce, identity }) {
    const key = `${this.prefix}${String(nonce || "")}`;
    const raw = await this.client.sendCommand(["GETDEL", key]);
    if (!raw) throw Object.assign(new Error("challenge nonce not found or already used"), { status: 401, code: "UNKNOWN_OR_REPLAYED_NONCE" });
    let entry;
    try { entry = JSON.parse(raw); } catch { throw Object.assign(new Error("challenge state is invalid"), { status: 401, code: "INVALID_CHALLENGE_STATE" }); }
    if (this.now() >= Number(entry.expiresAt || 0)) throw Object.assign(new Error("challenge expired"), { status: 401, code: "EXPIRED_NONCE" });
    if (entry.identity !== identity) throw Object.assign(new Error("challenge address mismatch"), { status: 401, code: "ADDRESS_MISMATCH" });
    return Object.freeze({ message: entry.message, expiresAt: entry.expiresAt });
  }
}

const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

export class RedisRateLimiter {
  constructor({ client, prefix = "skillpass:rate:", now = () => Date.now() } = {}) {
    if (!client) throw new Error("RedisRateLimiter requires client");
    this.client = client;
    this.prefix = prefix;
    this.now = now;
  }

  async consume(subject, { limit = 90, windowMs = 60_000 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("rate limit must be a positive integer");
    if (!Number.isSafeInteger(windowMs) || windowMs < 100) throw new Error("rate window must be >=100ms");
    const now = this.now();
    const window = Math.floor(now / windowMs);
    const hash = createHash("sha256").update(String(subject || "unknown")).digest("hex").slice(0, 32);
    const key = `${this.prefix}${windowMs}:${window}:${hash}`;
    const result = await this.client.eval(RATE_LIMIT_LUA, { keys: [key], arguments: [String(windowMs)] });
    const count = Number(result?.[0] || 0);
    const ttlMs = Math.max(0, Number(result?.[1] || windowMs));
    return { allowed: count <= limit, count, limit, retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) };
  }
}

function normalizeDelegationUsageInput({ grantId, invocationKey, maxUses, maxSpendAtomic, spendAtomic = "0", expiresAt }) {
  const id = String(grantId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error("delegation grantId is invalid");
  const key = String(invocationKey || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("delegation invocationKey must be a SHA-256 hex digest");
  const uses = maxUses == null ? null : Number(maxUses);
  if (uses != null && (!Number.isSafeInteger(uses) || uses < 1 || uses > 10_000)) throw new Error("delegation maxUses must be 1..10000");
  const normalizeAtomic = (value, label, nullable = false) => {
    if (nullable && (value == null || value === "")) return null;
    const raw = String(value ?? "0").trim();
    if (!/^[0-9]{1,78}$/.test(raw)) throw new Error(`${label} must be a non-negative atomic-unit integer string`);
    return BigInt(raw).toString();
  };
  const maxSpend = normalizeAtomic(maxSpendAtomic, "delegation maxSpendAtomic", true);
  const spend = normalizeAtomic(spendAtomic, "delegation spendAtomic");
  const expiry = Number(expiresAt);
  if (!Number.isSafeInteger(expiry) || expiry <= 0) throw new Error("delegation expiresAt is invalid");
  return { grantId: id, invocationKey: key, maxUses: uses, maxSpendAtomic: maxSpend, spendAtomic: spend, expiresAt: expiry };
}

function usageResult({ usedCalls, usedSpendAtomic, maxUses, maxSpendAtomic, replayed }) {
  const calls = Number(usedCalls);
  const spend = BigInt(String(usedSpendAtomic || "0"));
  const maxSpend = maxSpendAtomic == null ? null : BigInt(maxSpendAtomic);
  return Object.freeze({
    usedCalls: calls,
    usedSpendAtomic: spend.toString(),
    remainingUses: maxUses == null ? null : Math.max(0, maxUses - calls),
    remainingSpendAtomic: maxSpend == null ? null : (maxSpend > spend ? maxSpend - spend : 0n).toString(),
    replayed: Boolean(replayed),
  });
}

export class PostgresDelegationUsageLedger {
  constructor({ pool, now = () => Date.now() } = {}) {
    if (!pool) throw new Error("PostgresDelegationUsageLedger requires pool");
    this.pool = pool;
    this.now = now;
  }

  async consume(input) {
    const normalized = normalizeDelegationUsageInput(input);
    if (this.now() >= normalized.expiresAt) throw Object.assign(new Error("delegation is expired"), { status: 403, code: "DELEGATION_EXPIRED" });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO skillpass_delegation_usage(grant_id, used_calls, used_spend, expires_at, updated_at)
         VALUES ($1, 0, 0, to_timestamp($2::double precision / 1000.0), clock_timestamp())
         ON CONFLICT (grant_id) DO NOTHING`,
        [normalized.grantId, normalized.expiresAt],
      );
      const { rows } = await client.query(
        `SELECT used_calls::text AS used_calls, used_spend::text AS used_spend,
                extract(epoch from expires_at) * 1000 AS expires_ms
           FROM skillpass_delegation_usage
          WHERE grant_id = $1 FOR UPDATE`,
        [normalized.grantId],
      );
      if (!rows.length) throw new Error("delegation usage row is missing");
      const row = rows[0];
      const storedExpiry = Math.trunc(Number(row.expires_ms));
      if (storedExpiry !== normalized.expiresAt) {
        throw Object.assign(new Error("delegation grantId collision detected"), { status: 403, code: "DELEGATION_GRANT_COLLISION" });
      }
      const replay = await client.query(
        `SELECT spend::text AS spend FROM skillpass_delegation_invocations WHERE grant_id = $1 AND invocation_key = $2`,
        [normalized.grantId, normalized.invocationKey],
      );
      if (replay.rows.length) {
        await client.query("COMMIT");
        return usageResult({ usedCalls: row.used_calls, usedSpendAtomic: row.used_spend, maxUses: normalized.maxUses, maxSpendAtomic: normalized.maxSpendAtomic, replayed: true });
      }
      const usedCalls = Number(row.used_calls || 0);
      const usedSpend = BigInt(String(row.used_spend || "0"));
      const nextCalls = usedCalls + 1;
      const nextSpend = usedSpend + BigInt(normalized.spendAtomic);
      if (normalized.maxUses != null && nextCalls > normalized.maxUses) {
        throw Object.assign(new Error("delegation use limit exhausted"), { status: 403, code: "DELEGATION_USE_LIMIT_EXHAUSTED" });
      }
      if (normalized.maxSpendAtomic != null && nextSpend > BigInt(normalized.maxSpendAtomic)) {
        throw Object.assign(new Error("delegation spend limit exhausted"), { status: 403, code: "DELEGATION_SPEND_LIMIT_EXHAUSTED" });
      }
      await client.query(
        `UPDATE skillpass_delegation_usage
            SET used_calls = $2, used_spend = $3::numeric, updated_at = clock_timestamp()
          WHERE grant_id = $1`,
        [normalized.grantId, nextCalls, nextSpend.toString()],
      );
      await client.query(
        `INSERT INTO skillpass_delegation_invocations(grant_id, invocation_key, spend, created_at)
         VALUES ($1, $2, $3::numeric, clock_timestamp())`,
        [normalized.grantId, normalized.invocationKey, normalized.spendAtomic],
      );
      await client.query("COMMIT");
      return usageResult({ usedCalls: nextCalls, usedSpendAtomic: nextSpend, maxUses: normalized.maxUses, maxSpendAtomic: normalized.maxSpendAtomic, replayed: false });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async pruneExpired() {
    const result = await this.pool.query(
      `DELETE FROM skillpass_delegation_usage WHERE expires_at <= clock_timestamp() RETURNING grant_id`,
    );
    if (result.rows.length) {
      await this.pool.query(
        `DELETE FROM skillpass_delegation_invocations WHERE grant_id = ANY($1::text[])`,
        [result.rows.map((row) => row.grant_id)],
      );
    }
    return result.rowCount;
  }
}
