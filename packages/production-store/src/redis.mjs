import { createClient } from "redis";
import { redisUrlFromEnv } from "./config.mjs";

export async function createRedisClientFromEnv(env = process.env) {
  const client = createClient({
    url: redisUrlFromEnv(env),
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy(retries) { return Math.min(100 + retries * 100, 2_000); },
    },
    disableOfflineQueue: true,
  });
  client.on("error", () => {});
  await client.connect();
  return client;
}

export async function redisHealth(client) {
  const started = Date.now();
  const pong = await client.ping();
  if (pong !== "PONG") throw new Error("Redis PING failed");
  return { ok: true, latencyMs: Date.now() - started };
}
