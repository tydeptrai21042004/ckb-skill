function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("input contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (typeof value[key] === "undefined") throw new Error("input contains undefined");
      return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
    }).join(",")}}`;
  }
  throw new Error("input must be JSON-compatible");
}

function base(value) {
  const url = new URL(String(value));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("baseUrl must use http:// or https://");
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function jsonResponse(response) {
  const raw = await response.text();
  let value = {};
  try { value = raw ? JSON.parse(raw) : {}; }
  catch { throw Object.assign(new Error("SkillPass returned invalid JSON"), { status: response.status }); }
  return value;
}

async function sha256Hex(value) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new Error("Web Crypto API is required");
  const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function discoverSkillPass(baseUrl, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");
  const response = await fetchImpl(`${base(baseUrl)}/.well-known/skillpass.json`, { headers: { accept: "application/json" } });
  const value = await jsonResponse(response);
  if (!response.ok) throw Object.assign(new Error(value.message || "SkillPass discovery failed"), { status: response.status, body: value });
  return value;
}

export function resolveService(discovery, selector) {
  const services = Array.isArray(discovery?.services) ? discovery.services : [];
  const wanted = String(selector || "").toLowerCase();
  const service = services.find((item) => String(item.slug).toLowerCase() === wanted || String(item.id).toLowerCase() === wanted);
  if (!service) throw new Error(`SkillPass service not found: ${selector}`);
  return service;
}

export async function buildSignedInvocation({
  baseUrl,
  signer,
  outPoint,
  service,
  input,
  delegation,
  fetchImpl = globalThis.fetch,
}) {
  if (!signer || typeof signer.signMessage !== "function" || typeof signer.getRecommendedAddress !== "function") {
    throw new Error("signer must implement getRecommendedAddress() and signMessage()");
  }
  const address = await signer.getRecommendedAddress();
  const requestMaterial = service.inputKind === "text" ? String(input) : canonicalJson(input);
  const requestHash = await sha256Hex(requestMaterial);
  const challengeResponse = await fetchImpl(`${base(baseUrl)}/api/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      address,
      outPoint,
      requestHash,
      service: service.slug,
      delegationId: delegation?.grant?.grantId || "",
    }),
  });
  const challenge = await jsonResponse(challengeResponse);
  if (!challengeResponse.ok) throw Object.assign(new Error(challenge.message || "SkillPass challenge failed"), { status: challengeResponse.status, body: challenge });
  const signature = await signer.signMessage(challenge.message);
  if (signature?.identity !== address) throw new Error("signer identity does not match the acting CKB address");
  return {
    endpoint: `${base(baseUrl)}${service.endpoint || `/api/invoke/${service.slug}`}`,
    body: { address, nonce: challenge.nonce, signature, outPoint, input, ...(delegation ? { delegation } : {}) },
    challengeExpiresAt: challenge.expiresAt,
  };
}

export async function invokeSkillPass(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const signed = await buildSignedInvocation({ ...options, fetchImpl });
  const response = await fetchImpl(signed.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...(options.headers || {}) },
    body: JSON.stringify(signed.body),
  });
  const value = await jsonResponse(response);
  if (response.status === 402) {
    return {
      ok: false,
      paymentRequired: true,
      requirement: response.headers?.get?.("payment-required") || null,
      response: value,
    };
  }
  if (!response.ok) throw Object.assign(new Error(value.message || "SkillPass invocation failed"), { status: response.status, body: value });
  return { ok: true, paymentRequired: false, response: value };
}


export async function fetchAgentSpec(baseUrl, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");
  const response = await fetchImpl(`${base(baseUrl)}/.well-known/skillpass-agent.txt`, { headers: { accept: "text/plain" } });
  const text = await response.text();
  if (!response.ok) throw Object.assign(new Error("SkillPass agent spec could not be loaded"), { status: response.status, body: text });
  return text;
}

function normalizePaymentAdapter(adapter) {
  if (!adapter || typeof adapter.createPaymentSignature !== "function") {
    throw new Error("paymentAdapter.createPaymentSignature() is required for automatic x402 retry");
  }
  return adapter;
}

export async function invokeSkillPassWithPayment(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const first = await invokeSkillPass({ ...options, fetchImpl });
  if (!first.paymentRequired) return { ...first, paidRetry: false };
  const adapter = normalizePaymentAdapter(options.paymentAdapter);
  const paymentSignature = await adapter.createPaymentSignature({
    requirement: first.requirement,
    response: first.response,
    service: options.service,
    baseUrl: base(options.baseUrl),
  });
  if (typeof paymentSignature !== "string" || !paymentSignature.trim()) {
    throw new Error("payment adapter returned an empty PAYMENT-SIGNATURE value");
  }

  // A paid retry always obtains a fresh one-time wallet challenge. This avoids
  // reusing the intent nonce that was consumed by the initial 402 request.
  const signed = await buildSignedInvocation({ ...options, fetchImpl });
  const response = await fetchImpl(signed.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "payment-signature": paymentSignature,
      ...(options.headers || {}),
    },
    body: JSON.stringify(signed.body),
  });
  const value = await jsonResponse(response);
  if (response.status === 402) {
    return {
      ok: false,
      paymentRequired: true,
      paidRetry: true,
      requirement: response.headers?.get?.("payment-required") || null,
      response: value,
    };
  }
  if (!response.ok) throw Object.assign(new Error(value.message || "SkillPass paid invocation failed"), { status: response.status, body: value });
  return { ok: true, paymentRequired: false, paidRetry: true, response: value };
}
