import http from "node:http";
import { randomUUID } from "node:crypto";

function fallbackServer() {
  return http.createServer((req, res) => {
    const requestId = randomUUID();
    const body = JSON.stringify({
      error: "facilitator_not_configured",
      code: "FACILITATOR_NOT_CONFIGURED",
      message: "Fiber payment service is unavailable.",
      requestId,
    });
    res.writeHead(503, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
      "retry-after": "60",
      "x-request-id": requestId,
      "x-content-type-options": "nosniff",
    });
    if (req.method === "HEAD") return res.end();
    return res.end(body);
  });
}

const server = await (async () => {
try {
  return (await import("./server.mjs")).server;
} catch (error) {
  console.error("SkillPass facilitator bootstrap failed:", error instanceof Error ? error.message : "unknown error");
  return fallbackServer();
}
})();

export default server;
