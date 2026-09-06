import { readFileSync } from "node:fs";

export function readSecret(name, env = process.env) {
  const file = String(env[`${name}_FILE`] || "").trim();
  if (file) return readFileSync(file, "utf8").trim();
  return String(env[name] || "").trim();
}

export function postgresConfigFromEnv(env = process.env) {
  const max = Number(env.POSTGRES_POOL_MAX || (env.VERCEL ? 2 : 20));
  if (!Number.isSafeInteger(max) || max < 1 || max > 200) throw new Error("POSTGRES_POOL_MAX must be 1..200");

  // Vercel Marketplace / Neon injects DATABASE_URL automatically. Prefer it
  // when present so a Vercel deployment needs no manual host/user/password
  // database configuration. The legacy split POSTGRES_* variables remain
  // supported for Docker/self-hosted deployments.
  const connectionString = readSecret("DATABASE_URL", env);
  if (connectionString) {
    if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
      throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
    }
    return {
      connectionString,
      max,
      connectionTimeoutMillis: env.VERCEL ? 3_000 : 5_000,
      idleTimeoutMillis: env.VERCEL ? 5_000 : 30_000,
      statement_timeout: 8_000,
      query_timeout: 10_000,
      allowExitOnIdle: Boolean(env.VERCEL),
    };
  }

  const password = readSecret("POSTGRES_PASSWORD", env);
  const host = String(env.POSTGRES_HOST || "127.0.0.1").trim();
  const database = String(env.POSTGRES_DB || "skillpass").trim();
  const user = String(env.POSTGRES_USER || "skillpass").trim();
  const port = Number(env.POSTGRES_PORT || 5432);
  if (!host || !database || !user || !password) {
    throw new Error("DATABASE_URL or PostgreSQL host/database/user/password are required");
  }
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("POSTGRES_PORT must be 1..65535");
  const sslMode = String(env.POSTGRES_SSLMODE || "disable").trim().toLowerCase();
  if (!["disable", "require"].includes(sslMode)) throw new Error("POSTGRES_SSLMODE must be disable or require");
  return {
    host,
    port,
    database,
    user,
    password,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 8_000,
    query_timeout: 10_000,
    allowExitOnIdle: false,
    ...(sslMode === "require" ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

export function redisUrlFromEnv(env = process.env) {
  const host = String(env.REDIS_HOST || "127.0.0.1").trim();
  const port = Number(env.REDIS_PORT || 6379);
  const password = readSecret("REDIS_PASSWORD", env);
  if (!host || !password) throw new Error("Redis host/password are required");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("REDIS_PORT must be 1..65535");
  const encoded = encodeURIComponent(password);
  return `redis://:${encoded}@${host}:${port}`;
}
