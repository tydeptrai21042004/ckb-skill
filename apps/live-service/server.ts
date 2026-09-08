import http from "node:http";
import { randomUUID } from "node:crypto";

function fallbackServer() {
  return http.createServer((req, res) => {
    const requestId = randomUUID();
    const body = JSON.stringify({
      error: "service_not_configured",
      code: "SERVICE_NOT_CONFIGURED",
      message: "SkillPass service configuration is incomplete or unavailable.",
      requestId,
    });
    res.writeHead(503, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
      "retry-after": "60",
      "x-request-id": requestId,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    if (req.method === "HEAD") return res.end();
    return res.end(body);
  });
}

const server = await (async () => {
try {
  return (await import("./server.mjs")).server;
} catch (error) {
  // Keep deployment details in server logs only. Browser/API callers always get
  // bounded JSON instead of Vercel's plain-text bootstrap error page.
  console.error("SkillPass API bootstrap failed:", error instanceof Error ? error.message : "unknown error");
  return fallbackServer();
}
})();

export default server;
