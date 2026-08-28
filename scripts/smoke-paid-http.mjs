import { spawn } from "node:child_process";
import { once } from "node:events";
import { decodeHeaderJson, encodeHeaderJson } from "../packages/x402-fiber/src/index.mjs";

const port = 8792;
const child = spawn(process.execPath, ["apps/demo-service/server.mjs"], {
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"]
});
let logs = ""; child.stdout.on("data", d => logs += d); child.stderr.on("data", d => logs += d);
const base = `http://127.0.0.1:${port}`;
async function post(path, body, headers = {}) {
  return fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
async function wait() {
  for (let i=0;i<60;i++) { try { if ((await fetch(base + "/health")).ok) return; } catch {} await new Promise(r=>setTimeout(r,100)); }
  throw new Error(`demo did not start\n${logs}`);
}
try {
  await wait();
  const state = await (await fetch(base + "/api/demo/state")).json();
  const body = { identity: "alice", outPoint: state.currentOutPoint, text: "Method. Paid capability test. Result. Works. Conclusion." };
  const first = await post("/api/demo/paid-use", body);
  if (first.status !== 402) throw new Error(`expected initial 402, got ${first.status}`);
  const requiredHeader = first.headers.get("payment-required");
  if (!requiredHeader) throw new Error("PAYMENT-REQUIRED header missing");
  const required = decodeHeaderJson(requiredHeader, "PAYMENT-REQUIRED");
  const paymentHash = required.accepts[0].extra.paymentHash;
  const payloadResp = await post("/api/demo/payment-payload", { paymentHash, payer: "alice-agent" });
  const { paymentPayload } = await payloadResp.json();

  const unpaid = await post("/api/demo/paid-use", body, { "payment-signature": encodeHeaderJson(paymentPayload) });
  if (unpaid.status !== 402) throw new Error(`unpaid request should remain 402, got ${unpaid.status}`);
  await post("/api/demo/pay", { paymentHash, payer: "alice-agent" });
  const paid = await post("/api/demo/paid-use", body, { "payment-signature": encodeHeaderJson(paymentPayload) });
  if (paid.status !== 200) throw new Error(`paid owner request failed ${paid.status}: ${await paid.text()}`);
  if (!paid.headers.get("payment-response")) throw new Error("PAYMENT-RESPONSE header missing");

  const replay = await post("/api/demo/paid-use", body, { "payment-signature": encodeHeaderJson(paymentPayload) });
  if (replay.status !== 402) throw new Error(`payment replay should be rejected, got ${replay.status}`);

  // Transfer changes authorization independently of payment state.
  const transfer = await post("/api/demo/transfer", { from: "alice", to: "bob" });
  const transferred = await transfer.json();
  const aliceNewQuote = await post("/api/demo/paid-use", { ...body, outPoint: transferred.successorOutPoint });
  const aliceReq = decodeHeaderJson(aliceNewQuote.headers.get("payment-required"), "PAYMENT-REQUIRED");
  const aliceHash = aliceReq.accepts[0].extra.paymentHash;
  const alicePayload = (await (await post("/api/demo/payment-payload", { paymentHash: aliceHash, payer: "alice-agent" })).json()).paymentPayload;
  await post("/api/demo/pay", { paymentHash: aliceHash, payer: "alice-agent" });
  const oldOwner = await post("/api/demo/paid-use", { ...body, outPoint: transferred.successorOutPoint }, { "payment-signature": encodeHeaderJson(alicePayload) });
  if (oldOwner.status !== 403) throw new Error(`old owner must be rejected after transfer, got ${oldOwner.status}`);

  const bobBody = { identity: "bob", outPoint: transferred.successorOutPoint, text: body.text };
  const bobQuoteResp = await post("/api/demo/paid-use", bobBody);
  const bobReq = decodeHeaderJson(bobQuoteResp.headers.get("payment-required"), "PAYMENT-REQUIRED");
  const bobHash = bobReq.accepts[0].extra.paymentHash;
  const bobPayload = (await (await post("/api/demo/payment-payload", { paymentHash: bobHash, payer: "bob-agent" })).json()).paymentPayload;
  await post("/api/demo/pay", { paymentHash: bobHash, payer: "bob-agent" });
  const bob = await post("/api/demo/paid-use", bobBody, { "payment-signature": encodeHeaderJson(bobPayload) });
  if (bob.status !== 200) throw new Error(`new owner paid request failed ${bob.status}: ${await bob.text()}`);
  console.log("Combined SkillPass + x402/Fiber smoke passed: 402 -> pay -> owner access -> replay reject -> transfer -> old owner reject -> new owner paid access");
} finally {
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise(r=>setTimeout(r,500))]);
}
