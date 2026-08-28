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
