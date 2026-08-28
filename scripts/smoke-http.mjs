import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = Number(process.env.SMOKE_PORT || 18787);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["apps/demo-service/server.mjs"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (c) => { logs += c.toString(); });
child.stderr.on("data", (c) => { logs += c.toString(); });

async function waitForHealth() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`server did not become healthy\n${logs}`);
}

async function json(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

try {
  await waitForHealth();
  const html = await fetch(`${base}/`);
  const htmlText = await html.text();
  if (!html.ok || !htmlText.includes("SkillPass")) throw new Error("interactive web UI did not load");

  let { data: state } = await json("/api/demo/state");
  if (state.currentOwner !== "alice") throw new Error("Alice must own the initial capability");

  const a1 = await json("/api/demo/use", { identity: "alice", outPoint: state.currentOutPoint, text: "Method. Result. Conclusion." });
  if (!a1.response.ok) throw new Error(`Alice should be accepted: ${JSON.stringify(a1.data)}`);

  const transfer = await json("/api/demo/transfer", { from: "alice", to: "bob", outPoint: state.currentOutPoint });
  if (!transfer.response.ok || transfer.data.state.currentOwner !== "bob") throw new Error("transfer to Bob failed");
  state = transfer.data.state;

  const a2 = await json("/api/demo/use", { identity: "alice", outPoint: state.currentOutPoint, text: "Method. Result." });
  if (a2.response.status !== 403) throw new Error(`Alice should be denied after transfer; got ${a2.response.status}`);

  const b = await json("/api/demo/use", { identity: "bob", outPoint: state.currentOutPoint, text: "Method. Result. Conclusion." });
  if (!b.response.ok) throw new Error(`Bob should be accepted: ${JSON.stringify(b.data)}`);

  console.log("HTTP/UI SMOKE PASSED: page loads -> Alice uses -> transfer -> Alice denied -> Bob uses");
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(1000)]);
  if (!child.killed) child.kill("SIGKILL");
}
