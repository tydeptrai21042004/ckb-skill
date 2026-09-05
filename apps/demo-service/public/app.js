const $ = (selector) => document.querySelector(selector);
const logEl = $("#log");
const paperEl = $("#paper");
let state;
let selectedIdentity = "alice";
let accessMode = "direct";

const SAMPLE_TEXT = "Method. We evaluate capability-based access to a protected service. Result. The current owner can use the service while a previous owner is rejected after transfer. Conclusion. Authorization follows the live capability state.";

function titleCase(value) {
  return String(value || "").replace(/^./, (c) => c.toUpperCase());
}

function short(value, n = 9) {
  const text = String(value || "");
  return text.length > n * 2 ? `${text.slice(0, n)}…${text.slice(-n)}` : text;
}

function log(title, payload) {
  const time = new Date().toLocaleTimeString();
  const rendered = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const previous = logEl.textContent === "Simulator loading…" ? "" : logEl.textContent;
  logEl.textContent = `[${time}] ${title}\n${rendered}\n\n${previous}`;
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

function renderState() {
  const owner = state?.currentOwner || "none";
  $("#service").textContent = state?.service || "—";
  $("#owner").textContent = titleCase(owner);
  $("#owner-avatar").textContent = owner === "bob" ? "B" : owner === "alice" ? "A" : "—";
  $("#outpoint").textContent = state?.currentOutPoint ? `${short(state.currentOutPoint.txHash, 8)}:${state.currentOutPoint.index}` : "no live cell";
  const other = owner === "alice" ? "Bob" : "Alice";
  $("#transfer").textContent = owner === "none" ? "No live pass" : `Transfer to ${other}`;
  $("#transfer").disabled = owner === "none";
  $("#transfer-helper").textContent = owner === "none"
    ? "Reset the simulator to create a fresh capability."
    : `Moves the live capability from ${titleCase(owner)} to ${other}.`;
}

function renderIdentity() {
  for (const button of document.querySelectorAll("[data-identity]")) {
    button.classList.toggle("selected", button.dataset.identity === selectedIdentity);
  }
  $("#request-identity").textContent = titleCase(selectedIdentity);
  $("#request-avatar").textContent = selectedIdentity === "bob" ? "B" : "A";
}

function renderMode() {
  for (const label of document.querySelectorAll(".mode-option")) {
    const input = label.querySelector("input");
    label.classList.toggle("selected", input.value === accessMode);
  }
  $("#run").firstChild.textContent = accessMode === "paid" ? "Run paid analysis " : "Run analysis ";
}

function renderCharCount() {
  $("#char-count").textContent = `${paperEl.value.length.toLocaleString()} / 20,000`;
}

function clearResult() {
  $("#result-empty").hidden = false;
  $("#result-content").hidden = true;
  $("#denied-content").hidden = true;
  $("#result-status").textContent = "Waiting";
  $("#result-status").className = "result-status idle";
}

function renderSuccess(result) {
  $("#result-empty").hidden = true;
  $("#denied-content").hidden = true;
  $("#result-content").hidden = false;
  $("#result-status").textContent = "Access granted";
  $("#result-status").className = "result-status success";
  $("#metric-words").textContent = Number(result.words || 0).toLocaleString();
  $("#metric-sentences").textContent = Number(result.sentences || 0).toLocaleString();
  $("#metric-characters").textContent = Number(result.characters || 0).toLocaleString();
  $("#metric-diversity").textContent = typeof result.lexicalDiversity === "number" ? `${Math.round(result.lexicalDiversity * 100)}%` : "—";
  $("#result-preview").textContent = result.preview || "No preview available.";
  const markers = Object.entries(result.markerHits || {}).filter(([, count]) => count > 0);
  $("#marker-list").replaceChildren(...(markers.length
    ? markers.map(([name, count]) => {
        const item = document.createElement("span");
        const value = document.createElement("strong");
        item.append(document.createTextNode(name), value);
        value.textContent = String(count);
        return item;
      })
    : [Object.assign(document.createElement("span"), { textContent: "No tracked markers" })]));
}

function renderDenied(error) {
  $("#result-empty").hidden = true;
  $("#result-content").hidden = true;
  $("#denied-content").hidden = false;
  $("#result-status").textContent = "Access denied";
  $("#result-status").className = "result-status denied";
  $("#denied-message").textContent = error?.payload?.message || error?.message || "The request was rejected.";
}

async function refresh() {
  state = await api("/api/demo/state");
  renderState();
}

async function paidUse(identity) {
  const requestBody = { identity, outPoint: state.currentOutPoint, text: paperEl.value };
  const first = await fetch("/api/demo/paid-use", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const required = await first.json();
  if (first.status !== 402 || !required?.accepts?.[0]?.extra?.paymentHash) {
    throw Object.assign(new Error("Expected x402 payment challenge."), { payload: required });
  }

  const paymentHash = required.accepts[0].extra.paymentHash;
  log("PAYMENT REQUIRED", { paymentHash, amount: required.accepts[0].amount, asset: required.accepts[0].asset });
  await api("/api/demo/pay", { method: "POST", body: JSON.stringify({ paymentHash, payer: `local-${identity}` }) });
  const formed = await api("/api/demo/payment-payload", { method: "POST", body: JSON.stringify({ paymentHash, payer: `local-${identity}` }) });
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

for (const button of document.querySelectorAll("[data-identity]")) {
  button.addEventListener("click", () => {
    selectedIdentity = button.dataset.identity;
    renderIdentity();
    clearResult();
  });
}

for (const input of document.querySelectorAll('input[name="mode"]')) {
  input.addEventListener("change", () => {
    accessMode = input.value;
    renderMode();
    clearResult();
  });
}

paperEl.addEventListener("input", renderCharCount);
$("#sample").addEventListener("click", () => {
  paperEl.value = SAMPLE_TEXT;
  renderCharCount();
  paperEl.focus();
});

$("#run").addEventListener("click", async () => {
  const runButton = $("#run");
  if (!paperEl.value.trim()) {
    renderDenied(new Error("Enter some text before running the service."));
    return;
  }
  runButton.disabled = true;
  const originalText = runButton.textContent;
  runButton.textContent = accessMode === "paid" ? "Simulating payment…" : "Verifying access…";
  try {
    const response = accessMode === "paid"
      ? await paidUse(selectedIdentity)
      : await api("/api/demo/use", {
          method: "POST",
          body: JSON.stringify({ identity: selectedIdentity, outPoint: state.currentOutPoint, text: paperEl.value }),
        });
    const result = response.result || response;
    renderSuccess(result);
    log(`${selectedIdentity.toUpperCase()} ${accessMode === "paid" ? "PAID " : ""}ACCESS GRANTED`, response);
  } catch (error) {
    renderDenied(error);
    log(`${selectedIdentity.toUpperCase()} ${accessMode === "paid" ? "PAID " : ""}ACCESS DENIED`, error.payload || error.message);
  } finally {
    runButton.disabled = false;
    runButton.textContent = originalText;
    await refresh();
  }
});

$("#transfer").addEventListener("click", async () => {
  const from = state.currentOwner;
  const to = from === "alice" ? "bob" : "alice";
  if (!from || from === "none") return;
  const button = $("#transfer");
  button.disabled = true;
  try {
    const result = await api("/api/demo/transfer", {
      method: "POST",
      body: JSON.stringify({ from, to, outPoint: state.currentOutPoint }),
    });
    log(`TRANSFER ${from.toUpperCase()} → ${to.toUpperCase()}`, result);
    await refresh();
    clearResult();
  } catch (error) {
    log("TRANSFER REJECTED", error.payload || error.message);
  } finally {
    button.disabled = false;
    renderState();
  }
});

$("#reset").addEventListener("click", async () => {
  const result = await api("/api/demo/reset", { method: "POST", body: "{}" });
  state = result.state;
  selectedIdentity = "alice";
  accessMode = "direct";
  document.querySelector('input[name="mode"][value="direct"]').checked = true;
  paperEl.value = "";
  renderState();
  renderIdentity();
  renderMode();
  renderCharCount();
  clearResult();
  logEl.textContent = "Simulator reset. Alice owns a fresh capability.";
});

await refresh();
renderIdentity();
renderMode();
renderCharCount();
clearResult();
log("SIMULATOR READY", state);
