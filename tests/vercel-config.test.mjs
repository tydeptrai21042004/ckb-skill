import test from "node:test";
import assert from "node:assert/strict";
import { postgresConfigFromEnv } from "../packages/production-store/src/config.mjs";

test("Vercel/Neon DATABASE_URL is accepted without split POSTGRES variables", () => {
  const config = postgresConfigFromEnv({
    VERCEL: "1",
    DATABASE_URL: "postgresql://user:pass@example.neon.tech/skillpass?sslmode=require",
  });
  assert.equal(config.connectionString, "postgresql://user:pass@example.neon.tech/skillpass?sslmode=require");
  assert.equal(config.max, 2);
  assert.equal(config.allowExitOnIdle, true);
});

test("legacy split PostgreSQL configuration still works", () => {
  const config = postgresConfigFromEnv({
    POSTGRES_HOST: "db",
    POSTGRES_DB: "skillpass",
    POSTGRES_USER: "skillpass",
    POSTGRES_PASSWORD: "secret",
    POSTGRES_PORT: "5432",
  });
  assert.equal(config.host, "db");
  assert.equal(config.database, "skillpass");
  assert.equal(config.max, 20);
});
