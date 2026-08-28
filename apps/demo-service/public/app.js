const $ = (selector) => document.querySelector(selector);
const logEl = $("#log");
let state;

function log(title, payload) {
  const time = new Date().toLocaleTimeString();
  const rendered = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  logEl.textContent = `[${time}] ${title}\n${rendered}\n\n${logEl.textContent === "Loading…" ? "" : logEl.textContent}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.message || body.error || `HTTP ${response.status}`);
    error.payload = body;
    throw error;
  }
  return body;
}

function render() {
  $("#service").textContent = state.service;
  $("#owner").textContent = state.currentOwner;
  $("#outpoint").textContent = state.currentOutPoint || "no live cell";
}

async function refresh() {
  state = await api("/api/demo/state");
  render();
}

for (const button of document.querySelectorAll("[data-use]")) {
  button.addEventListener("click", async () => {
    const identity = button.dataset.use;
    try {
      const result = await api("/api/demo/use", {
        method: "POST",
        body: JSON.stringify({ identity, outPoint: state.currentOutPoint, text: $("#paper").value }),
      });
      log(`${identity.toUpperCase()} ACCESS GRANTED`, result.result);
    } catch (error) {
      log(`${identity.toUpperCase()} ACCESS DENIED`, error.payload || error.message);
    }
    await refresh();
  });
}


async function paidUse(identity) {
  const requestBody = { identity, outPoint: state.currentOutPoint, text: $("#paper").value };
  const first = await fetch("/api/demo/paid-use", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const required = await first.json();
  if (first.status !== 402 || !required?.accepts?.[0]?.extra?.paymentHash) {
    throw Object.assign(new Error("expected x402 Payment Required response"), { payload: required });
  }

  const paymentHash = required.accepts[0].extra.paymentHash;
  await api("/api/demo/pay", {
    method: "POST",
    body: JSON.stringify({ paymentHash, payer: `local-${identity}` }),
  });
  const formed = await api("/api/demo/payment-payload", {
    method: "POST",
    body: JSON.stringify({ paymentHash, payer: `local-${identity}` }),
  });
  const signature = btoa(JSON.stringify(formed.paymentPayload));
  const second = await fetch("/api/demo/paid-use", {
    method: "POST",
    headers: { "content-type": "application/json", "payment-signature": signature },
    body: JSON.stringify(requestBody),
  });
  const body = await second.json();
  if (!second.ok) throw Object.assign(new Error(body.message || body.error || `HTTP ${second.status}`), { payload: body });
  return body;
}

for (const button of document.querySelectorAll("[data-paid-use]")) {
  button.addEventListener("click", async () => {
    const identity = button.dataset.paidUse;
    try {
      const result = await paidUse(identity);
      log(`${identity.toUpperCase()} PAID ACCESS GRANTED`, result);
    } catch (error) {
      log(`${identity.toUpperCase()} PAID ACCESS DENIED`, error.payload || error.message);
    }
    await refresh();
  });
}

$("#transfer").addEventListener("click", async () => {
  try {
    const result = await api("/api/demo/transfer", {
      method: "POST",
      body: JSON.stringify({ from: "alice", to: "bob", outPoint: state.currentOutPoint }),
    });
    log("TRANSFER COMMITTED", result);
  } catch (error) {
    log("TRANSFER REJECTED", error.payload || error.message);
  }
  await refresh();
});

$("#reset").addEventListener("click", async () => {
  const result = await api("/api/demo/reset", { method: "POST", body: "{}" });
  state = result.state;
  render();
  logEl.textContent = "Demo reset. Alice owns a fresh capability.";
});

await refresh();
log("READY", state);
