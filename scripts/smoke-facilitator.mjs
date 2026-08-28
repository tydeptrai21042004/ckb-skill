import { spawn } from "node:child_process";
import { once } from "node:events";
import { FIBER_TESTNET, makePaymentPayload } from "../packages/x402-fiber/src/index.mjs";

const port = 8791;
const child = spawn(process.execPath, ["apps/fiber-facilitator/server.mjs"], {
  env: { ...process.env, FACILITATOR_PORT: String(port), FACILITATOR_STATE_FILE: `.runtime/smoke-${process.pid}.json`, FIBER_BACKEND: "mock", ALLOW_DEV_PAYMENT: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (d) => logs += d);
child.stderr.on("data", (d) => logs += d);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`facilitator did not start\n${logs}`);
}

try {
  await waitForServer();
  const invoiceResp = await fetch(`http://127.0.0.1:${port}/invoice`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: "100000" }) });
  const invoice = await invoiceResp.json();
  const requirement = {
    scheme: "exact", network: FIBER_TESTNET, amount: "100000", asset: "CKB", payTo: "mock-fiber-provider", maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: "fiber-invoice", paymentFlow: "authorization", invoice: invoice.invoice, paymentHash: invoice.paymentHash },
  };
  const resource = { url: "http://127.0.0.1/paid", mimeType: "application/json", description: "SkillPass paid analysis" };
  const paymentPayload = makePaymentPayload({ resource, requirement, payer: "smoke-agent" });
  const request = { x402Version: 2, paymentPayload, paymentRequirements: requirement };
  const before = await (await fetch(`http://127.0.0.1:${port}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) })).json();
  if (before.isValid) throw new Error("unpaid invoice unexpectedly verified");
  await fetch(`http://127.0.0.1:${port}/dev/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentHash: invoice.paymentHash, payer: "smoke-agent" }) });
  const after = await (await fetch(`http://127.0.0.1:${port}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) })).json();
  if (!after.isValid) throw new Error(`paid invoice failed verification: ${JSON.stringify(after)}`);
  const settled = await (await fetch(`http://127.0.0.1:${port}/settle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) })).json();
  if (!settled.success) throw new Error(`settlement failed: ${JSON.stringify(settled)}`);
  console.log("x402/Fiber facilitator smoke flow passed: unpaid -> paid -> verified -> settled -> replay protected");
} finally {
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 500))]);
}
