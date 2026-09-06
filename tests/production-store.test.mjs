import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresReplayStore,
  RedisChallengeStore,
  RedisRateLimiter,
} from "../packages/production-store/src/stores.mjs";

test("PostgresReplayStore normalizes payment hashes and reports one atomic winner", async () => {
  let consumed = false;
  const rows = new Map();
  const pool = {
    async query(sql, params) {
      if (sql.includes("INSERT INTO skillpass_payment_consumptions")) {
        const [hash, raw] = params;
        if (consumed) return { rowCount: 0, rows: [] };
        consumed = true;
        rows.set(hash, { metadata: JSON.parse(raw), consumed_ms: 1234 });
        return { rowCount: 1, rows: [{ payment_hash: hash }] };
      }
      if (sql.includes("SELECT metadata")) {
        const row = rows.get(params[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const store = new PostgresReplayStore({ pool });
  assert.equal(await store.consume("0xABC", { payer: "alice" }), true);
  assert.equal(await store.consume("0xabc", { payer: "alice" }), false);
  assert.deepEqual(await store.get("0xABC"), { key: "0xabc", consumedAt: 1234, payer: "alice" });
});

test("RedisChallengeStore burns nonce exactly once and binds it to identity", async () => {
  const kv = new Map();
  const client = {
    async set(key, value, options) {
      assert.equal(options.NX, true);
      if (kv.has(key)) return null;
      kv.set(key, value);
      return "OK";
    },
    async sendCommand(command) {
      assert.equal(command[0], "GETDEL");
      const value = kv.get(command[1]);
      kv.delete(command[1]);
      return value ?? null;
    },
  };
  const store = new RedisChallengeStore({ client, ttlMs: 60_000, now: () => 1_000 });
  const challenge = await store.issue("ckt1-user", ({ nonce, identity }) => `${identity}:${nonce}`);
  const first = await store.consume({ nonce: challenge.nonce, identity: "ckt1-user" });
  assert.equal(first.message, challenge.message);
  await assert.rejects(
    () => store.consume({ nonce: challenge.nonce, identity: "ckt1-user" }),
    (error) => error.code === "UNKNOWN_OR_REPLAYED_NONCE" && error.status === 401,
  );
});

test("RedisChallengeStore burns a stolen/mismatched challenge instead of allowing a later retry", async () => {
  const kv = new Map();
  const client = {
    async set(key, value) { kv.set(key, value); return "OK"; },
    async sendCommand(command) { const value = kv.get(command[1]); kv.delete(command[1]); return value ?? null; },
  };
  const store = new RedisChallengeStore({ client, ttlMs: 60_000, now: () => 1_000 });
  const challenge = await store.issue("alice", ({ nonce }) => nonce);
  await assert.rejects(() => store.consume({ nonce: challenge.nonce, identity: "bob" }), (error) => error.code === "ADDRESS_MISMATCH");
  await assert.rejects(() => store.consume({ nonce: challenge.nonce, identity: "alice" }), (error) => error.code === "UNKNOWN_OR_REPLAYED_NONCE");
});

test("RedisRateLimiter returns shared counter state and never exposes the raw subject in its key", async () => {
  let current = 0;
  let seenKey = "";
  const client = {
    async eval(script, options) {
      assert.match(script, /INCR/);
      assert.match(script, /PEXPIRE/);
      seenKey = options.keys[0];
      current += 1;
      return [current, 30_000];
    },
  };
  const limiter = new RedisRateLimiter({ client, now: () => 10_000 });
  assert.equal((await limiter.consume("203.0.113.5", { limit: 2, windowMs: 60_000 })).allowed, true);
  assert.equal((await limiter.consume("203.0.113.5", { limit: 2, windowMs: 60_000 })).allowed, true);
  const blocked = await limiter.consume("203.0.113.5", { limit: 2, windowMs: 60_000 });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 30);
  assert.equal(seenKey.includes("203.0.113.5"), false);
});
