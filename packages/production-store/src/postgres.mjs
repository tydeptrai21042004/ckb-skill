import pg from "pg";
import { postgresConfigFromEnv } from "./config.mjs";

const { Pool } = pg;

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS skillpass_service_records (
        namespace TEXT NOT NULL,
        record_key TEXT NOT NULL,
        value JSONB NOT NULL,
        expires_at TIMESTAMPTZ NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY (namespace, record_key)
      );
      CREATE INDEX IF NOT EXISTS skillpass_service_records_expiry_idx
        ON skillpass_service_records (expires_at)
        WHERE expires_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS skillpass_service_records_updated_idx
        ON skillpass_service_records (namespace, updated_at);

      CREATE TABLE IF NOT EXISTS skillpass_payment_consumptions (
        payment_hash TEXT PRIMARY KEY,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        consumed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX IF NOT EXISTS skillpass_payment_consumptions_time_idx
        ON skillpass_payment_consumptions (consumed_at);
    `,
  },
];

export function createPostgresPool(env = process.env) {
  return new Pool(postgresConfigFromEnv(env));
}

export async function migratePostgres(pool) {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('skillpass_schema_migrations'))");
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS skillpass_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      )
    `);
    const applied = new Set((await client.query("SELECT version FROM skillpass_schema_migrations")).rows.map((row) => Number(row.version)));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO skillpass_schema_migrations(version) VALUES ($1)", [migration.version]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock(hashtext('skillpass_schema_migrations'))"); } catch {}
    }
    client.release();
  }
}

export async function postgresHealth(pool) {
  const started = Date.now();
  await pool.query("SELECT 1 AS ok");
  return { ok: true, latencyMs: Date.now() - started };
}
