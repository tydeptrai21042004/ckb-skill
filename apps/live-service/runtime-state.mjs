import { randomBytes } from "node:crypto";
import {
  createPostgresPool,
  createRedisClientFromEnv,
  migratePostgres,
  postgresHealth,
  PostgresRecordStore,
  RedisChallengeStore,
  RedisRateLimiter,
  redisHealth,
} from "@skillpass/production-store";
import { LiveServiceState } from "./state.mjs";

class LocalChallengeStore {
  #entries = new Map();
  constructor({ ttlMs, now = () => Date.now() } = {}) { this.ttlMs = ttlMs; this.now = now; }
  #prune() {
    const now = this.now();
    for (const [nonce, item] of this.#entries) if (now >= item.expiresAt) this.#entries.delete(nonce);
    while (this.#entries.size > 10_000) this.#entries.delete(this.#entries.keys().next().value);
  }
  async issue(identity, buildMessage) {
    this.#prune();
    const nonce = randomBytes(24).toString("hex");
    const expiresAt = this.now() + this.ttlMs;
    const message = buildMessage({ nonce, identity, expiresAt });
    this.#entries.set(nonce, { identity, expiresAt, message });
    return { nonce, expiresAt, message };
  }
  async consume({ nonce, identity }) {
    const entry = this.#entries.get(String(nonce || ""));
    this.#entries.delete(String(nonce || ""));
    if (!entry) throw Object.assign(new Error("challenge nonce not found or already used"), { status: 401, code: "UNKNOWN_OR_REPLAYED_NONCE" });
    if (this.now() >= entry.expiresAt) throw Object.assign(new Error("challenge expired"), { status: 401, code: "EXPIRED_NONCE" });
    if (entry.identity !== identity) throw Object.assign(new Error("challenge address mismatch"), { status: 401, code: "ADDRESS_MISMATCH" });
    return { message: entry.message, expiresAt: entry.expiresAt };
  }
}

class LocalRateLimiter {
  #entries = new Map();
  constructor({ now = () => Date.now() } = {}) { this.now = now; }
  async consume(subject, { limit = 90, windowMs = 60_000 } = {}) {
    const now = this.now();
    const key = String(subject || "unknown");
    let item = this.#entries.get(key);
    if (!item || now >= item.resetAt) item = { count: 0, resetAt: now + windowMs };
    item.count += 1;
    this.#entries.set(key, item);
    if (this.#entries.size > 20_000) {
      for (const [k, row] of this.#entries) if (now >= row.resetAt) this.#entries.delete(k);
      while (this.#entries.size > 20_000) this.#entries.delete(this.#entries.keys().next().value);
    }
    return { allowed: item.count <= limit, count: item.count, limit, retryAfterSeconds: Math.max(1, Math.ceil((item.resetAt - now) / 1000)) };
  }
}

export async function createLiveRuntimeState({ backend = "local", stateFile = "", challengeTtlMs = 60_000, env = process.env } = {}) {
  if (backend === "local") {
    return {
      backend,
      serviceState: new LiveServiceState({ file: stateFile }),
      challenges: new LocalChallengeStore({ ttlMs: challengeTtlMs }),
      rateLimiter: new LocalRateLimiter(),
      async health() { return { ok: true, backend, postgres: { ok: true, skipped: true }, redis: { ok: true, skipped: true } }; },
      async close() {},
    };
  }
  if (backend !== "postgres-redis") throw new Error("STATE_BACKEND must be local or postgres-redis");

  const pool = createPostgresPool(env);
  await migratePostgres(pool);
  const redis = await createRedisClientFromEnv(env);
  const recordStore = new PostgresRecordStore({ pool, namespace: "live-service" });

  return {
    backend,
    serviceState: new LiveServiceState({ store: recordStore }),
    challenges: new RedisChallengeStore({ client: redis, ttlMs: challengeTtlMs }),
    rateLimiter: new RedisRateLimiter({ client: redis }),
    async health() {
      const [postgres, redisStatus] = await Promise.all([postgresHealth(pool), redisHealth(redis)]);
      return { ok: postgres.ok && redisStatus.ok, backend, postgres, redis: redisStatus };
    },
    async close() {
      await Promise.allSettled([redis.quit(), pool.end()]);
    },
  };
}
