import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFileSync } from "node:fs";
import { createGatewayAssertion } from "@skillpass/provider-verifier";
import {
  COMPUTE_API_V1_SERVICE_ID,
  MODEL_API_V1_SERVICE_ID,
  PRIVATE_DATA_API_V1_SERVICE_ID,
  PRIVATE_JSON_GATEWAY_V1_SERVICE_ID,
} from "@skillpass/capability-codec/service-ids";
import { createServiceRegistry, normalizeServiceSlug, validateServiceInput } from "@skillpass/service-gateway";
import { executeComputeReference, executeModelReference, executePrivateDataReference } from "./reference-services.mjs";

const DEFAULT_MAX_INPUT_CHARS = 20_000;

function readSecret(env, name) {
  const file = String(env[`${name}_FILE`] || "").trim();
  if (file) return readFileSync(file, "utf8").trim().replace(/\\n/g, "\n");
  return String(env[name] || "").trim().replace(/\\n/g, "\n");
}

function referenceProvider(env) {
  const providerId = String(env.SKILLPASS_PROVIDER_ID || "skillpass-reference-provider").trim();
  const providerName = String(env.SKILLPASS_PROVIDER_NAME || "SkillPass reference provider").trim();
  if (!/^[a-z0-9][a-z0-9_.:-]{0,127}$/i.test(providerId)) throw new Error("SKILLPASS_PROVIDER_ID is invalid");
  if (!providerName || providerName.length > 120) throw new Error("SKILLPASS_PROVIDER_NAME must be 1..120 characters");
  return { providerId, providerName };
}

function isPrivateLiteral(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (["localhost", "localhost.localdomain"].includes(host) || host.endsWith(".localhost")) return true;
  const kind = isIP(host);
  if (kind === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (kind === 6) {
    return host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb");
  }
  return false;
}

function allowedHosts(env) {
  return new Set(String(env.SKILLPASS_GATEWAY_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
}

function boundedUrl(raw, { production = false, allowed = new Set() } = {}) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("SkillPass upstream URL must use http:// or https://");
  if (url.username || url.password) throw new Error("gateway upstream URL must not embed credentials");
  if (isPrivateLiteral(url.hostname)) throw new Error("gateway upstream URL must not target localhost, private, link-local, multicast, or unspecified literal addresses");
  if (production && url.protocol !== "https:") throw new Error("gateway upstream must use https:// in public production");
  if (production && !allowed.size) throw new Error("SKILLPASS_GATEWAY_ALLOWED_HOSTS is required when an upstream gateway is enabled in public production");
  if (production && !allowed.has(url.hostname.toLowerCase())) throw new Error(`gateway upstream host is not allowlisted: ${url.hostname}`);
  return url;
}

async function resolvePinnedAddress(hostname) {
  const host = String(hostname || "").replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateLiteral(host)) throw Object.assign(new Error("upstream resolved to a private or reserved address"), { status: 502, code: "UPSTREAM_ADDRESS_REJECTED" });
    return { address: host, family: isIP(host) };
  }
  const answers = await lookup(host, { all: true, verbatim: true });
  if (!answers.length) throw Object.assign(new Error("upstream DNS returned no addresses"), { status: 502, code: "UPSTREAM_DNS_EMPTY" });
  for (const answer of answers) {
    if (isPrivateLiteral(answer.address)) throw Object.assign(new Error("upstream DNS resolved to a private or reserved address"), { status: 502, code: "UPSTREAM_ADDRESS_REJECTED" });
  }
  return answers[0];
}

export async function postJsonPinned(url, { headers, body, timeoutMs, maxResponseBytes }) {
  const pinned = await resolvePinnedAddress(url.hostname);
  const payload = Buffer.from(JSON.stringify(body));
  const requestImpl = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = requestImpl(url, {
      method: "POST",
      headers: { ...headers, "content-length": String(payload.length) },
      timeout: timeoutMs,
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
        else callback(null, pinned.address, pinned.family);
      },
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          req.destroy(Object.assign(new Error("upstream response is too large"), { status: 502, code: "UPSTREAM_RESPONSE_TOO_LARGE" }));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(Object.assign(new Error("protected upstream rejected the request"), { status: 502, code: "UPSTREAM_REJECTED" }));
          return;
        }
        const type = String(response.headers["content-type"] || "").toLowerCase();
        if (!type.includes("application/json") && !type.includes("+json")) {
          reject(Object.assign(new Error("protected upstream must return JSON"), { status: 502, code: "UPSTREAM_INVALID_CONTENT_TYPE" }));
          return;
        }
        try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null); }
        catch { reject(Object.assign(new Error("protected upstream returned invalid JSON"), { status: 502, code: "UPSTREAM_INVALID_JSON" })); }
      });
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("protected upstream timed out"), { status: 504, code: "UPSTREAM_TIMEOUT" })));
    req.on("error", reject);
    req.end(payload);
  });
}

async function readBoundedJson(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error("upstream response is too large");
    return text ? JSON.parse(text) : null;
  }
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error("upstream response is too large");
    }
    chunks.push(Buffer.from(value));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : null;
}

function boundedInteger(value, fallback, { min, max, label }) {
  const result = Number(value ?? fallback);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error(`${label} must be ${min}..${max}`);
  return result;
}

function parseBearerMap(env) {
  const raw = String(env.SKILLPASS_UPSTREAM_BEARERS_JSON || "").trim();
  if (!raw) return {};
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("SKILLPASS_UPSTREAM_BEARERS_JSON must be a JSON object"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SKILLPASS_UPSTREAM_BEARERS_JSON must be a JSON object");
  const result = {};
  for (const [slug, token] of Object.entries(value)) {
    const normalizedSlug = normalizeServiceSlug(slug);
    const secret = String(token || "");
    if (!secret || secret.length > 8192) throw new Error(`upstream bearer for ${normalizedSlug} must be 1..8192 characters`);
    result[normalizedSlug] = secret;
  }
  return result;
}

function httpGatewayService(raw, { env, production, defaultTimeoutMs, bearerMap, allowed }) {
  const slug = normalizeServiceSlug(raw.slug);
  const id = String(raw.id || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(id)) throw new Error(`upstream service ${slug} requires a 32-byte id`);
  const url = boundedUrl(raw.url, { production, allowed });
  if (!url) throw new Error(`upstream service ${slug} requires url`);
  const inputKind = raw.inputKind === "text" ? "text" : "json";
  const maxInputChars = boundedInteger(raw.maxInputChars, 20_000, { min: 1, max: 256_000, label: `${slug}.maxInputChars` });
  const maxResponseBytes = boundedInteger(raw.maxResponseBytes, 256_000, { min: 1024, max: 2_000_000, label: `${slug}.maxResponseBytes` });
  const serviceTimeoutMs = boundedInteger(raw.timeoutMs, defaultTimeoutMs, { min: 1000, max: 15_000, label: `${slug}.timeoutMs` });
  const operationMode = String(raw.operationMode || "read").trim().toLowerCase();
  if (!["read", "idempotent-action"].includes(operationMode)) throw new Error(`${slug}.operationMode must be read or idempotent-action`);
  const idempotencyMode = operationMode === "idempotent-action" ? String(raw.idempotencyMode || "").trim().toLowerCase() : null;
  if (operationMode === "idempotent-action" && idempotencyMode !== "invocation-key") {
    throw new Error(`${slug}.idempotencyMode must be invocation-key for idempotent-action upstreams`);
  }
  const bearer = bearerMap[slug] || "";
  const gatewaySigningPrivateKey = readSecret(env, "SKILLPASS_GATEWAY_SIGNING_PRIVATE_KEY") || readSecret(env, "SKILLPASS_PROVIDER_MANIFEST_PRIVATE_KEY");
  const gatewaySigningKeyId = String(env.SKILLPASS_GATEWAY_SIGNING_KEY_ID || env.SKILLPASS_PROVIDER_MANIFEST_KEY_ID || "gateway-2026-09").trim();
  const requireGatewayAssertion = env.SKILLPASS_REQUIRE_UPSTREAM_ASSERTION === "" || env.SKILLPASS_REQUIRE_UPSTREAM_ASSERTION == null
    ? production
    : String(env.SKILLPASS_REQUIRE_UPSTREAM_ASSERTION).toLowerCase() === "true";
  if (requireGatewayAssertion && !gatewaySigningPrivateKey) throw new Error(`upstream service ${slug} requires SKILLPASS_GATEWAY_SIGNING_PRIVATE_KEY(_FILE)`);
  return {
    slug,
    id,
    name: String(raw.name || slug).slice(0, 120),
    description: String(raw.description || "Operator-configured read/query API protected by SkillPass.").slice(0, 500),
    inputKind,
    maxInputChars,
    kind: "http-json-gateway",
    operationMode,
    idempotencyMode,
    providerId: String(raw.providerId || env.SKILLPASS_PROVIDER_ID || `provider-${slug}`).trim(),
    providerName: String(raw.providerName || env.SKILLPASS_PROVIDER_NAME || raw.name || slug).trim(),
    async execute(input, context = {}) {
      const validated = validateServiceInput(this, input);
      if (operationMode === "idempotent-action" && !/^[0-9a-f]{64}$/.test(String(context.invocationKey || ""))) {
        throw Object.assign(new Error("idempotent-action upstream requires a bound invocation key"), { status: 500, code: "INVOCATION_KEY_REQUIRED" });
      }
      const headers = {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "SkillPass-Gateway/2.0",
        "x-skillpass-service-id": id,
        "x-skillpass-capability-id": String(context.capabilityId || ""),
        "x-skillpass-request-id": String(context.requestId || ""),
        "x-skillpass-invocation-key": String(context.invocationKey || ""),
      };
      if (bearer) headers.authorization = `Bearer ${bearer}`;
      if (gatewaySigningPrivateKey) {
        headers["x-skillpass-authorization"] = createGatewayAssertion({
          privateKeyPem: gatewaySigningPrivateKey,
          keyId: gatewaySigningKeyId,
          ttlSeconds: 30,
          claims: {
            providerId: this.providerId, serviceId: id, capabilityId: String(context.capabilityId || ""),
            capabilityOutPoint: context.capabilityOutPoint || null, ownerLockHash: String(context.ownerLockHash || ""),
            principalAddress: String(context.principalAddress || ""), requestHash: String(context.requestHash || ""),
            policyId: String(context.policyId || ""), policyFingerprint: String(context.policyFingerprint || ""),
            operationId: String(context.operationId || ""), delegationId: String(context.delegationId || "direct"),
            invocationKey: String(context.invocationKey || ""), requestId: String(context.requestId || ""),
          },
        });
        headers["x-skillpass-authorization-key-id"] = gatewaySigningKeyId;
      }
      const payload = inputKind === "text" ? { text: validated } : validated;
      return postJsonPinned(url, { headers, body: payload, timeoutMs: serviceTimeoutMs, maxResponseBytes });
    },
  };
}

function parseConfiguredUpstreams(env, options) {
  const raw = String(env.SKILLPASS_UPSTREAM_SERVICES_JSON || "").trim();
  if (!raw) return [];
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("SKILLPASS_UPSTREAM_SERVICES_JSON must be a JSON array"); }
  if (!Array.isArray(value)) throw new Error("SKILLPASS_UPSTREAM_SERVICES_JSON must be a JSON array");
  if (value.length > 12) throw new Error("SKILLPASS_UPSTREAM_SERVICES_JSON supports at most 12 upstream services");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("each upstream service descriptor must be an object");
    return httpGatewayService(item, options);
  });
}

export function buildServiceRegistry({ env = process.env, production = false, timeoutMs = 8_000 } = {}) {
  const provider = referenceProvider(env);
  const services = [
    {
      slug: "model-api-v1",
      id: MODEL_API_V1_SERVICE_ID,
      name: "Model API",
      description: "Protected model inference/embedding access. The reference handler performs deterministic compute; production providers can attach a real model upstream.",
      inputKind: "text",
      maxInputChars: DEFAULT_MAX_INPUT_CHARS,
      kind: "builtin-reference",
      operationMode: "read",
      ...provider,
      async execute(input) { return executeModelReference(validateServiceInput(this, input), provider); },
    },
    {
      slug: "private-data-api-v1",
      id: PRIVATE_DATA_API_V1_SERVICE_ID,
      name: "Private Data API",
      description: "Protected access to provider-controlled datasets or read/query endpoints.",
      inputKind: "json",
      maxInputChars: DEFAULT_MAX_INPUT_CHARS,
      kind: "builtin-reference",
      operationMode: "read",
      ...provider,
      async execute(input) { return executePrivateDataReference(validateServiceInput(this, input), provider); },
    },
    {
      slug: "compute-api-v1",
      id: COMPUTE_API_V1_SERVICE_ID,
      name: "Compute API",
      description: "Protected deterministic compute execution; production providers can configure an idempotent-action upstream for real jobs.",
      inputKind: "json",
      maxInputChars: DEFAULT_MAX_INPUT_CHARS,
      kind: "builtin-reference",
      operationMode: "idempotent-action",
      idempotencyMode: "invocation-key",
      ...provider,
      async execute(input) { return executeComputeReference(validateServiceInput(this, input), provider); },
    },
  ];

  const allowed = allowedHosts(env);
  const bearerMap = parseBearerMap(env);
  const shared = { env, production, defaultTimeoutMs: timeoutMs, bearerMap, allowed };

  // Backward-compatible single gateway configuration.
  const legacyUrl = String(env.SKILLPASS_GATEWAY_UPSTREAM_URL || "").trim();
  if (legacyUrl) {
    const legacySlug = "private-json-gateway-v1";
    const legacyBearer = String(env.SKILLPASS_GATEWAY_AUTH_BEARER || "").trim();
    services.push(httpGatewayService({
      slug: legacySlug,
      id: String(env.SKILLPASS_GATEWAY_SERVICE_ID || PRIVATE_JSON_GATEWAY_V1_SERVICE_ID).trim().toLowerCase(),
      name: String(env.SKILLPASS_GATEWAY_NAME || "Private JSON API"),
      description: "Operator-configured JSON read/query API protected by the same live CKB Capability and optional Fiber/x402 policy.",
      url: legacyUrl,
      inputKind: "json",
      maxInputChars: env.SKILLPASS_GATEWAY_MAX_INPUT_CHARS || 20_000,
      maxResponseBytes: env.SKILLPASS_GATEWAY_MAX_RESPONSE_BYTES || 256_000,
      timeoutMs,
      operationMode: "read",
    }, { ...shared, bearerMap: { ...bearerMap, [legacySlug]: legacyBearer || bearerMap[legacySlug] || "" } }));
  }

  services.push(...parseConfiguredUpstreams(env, shared));
  if (services.length > 16) throw new Error("SkillPass supports at most 16 configured services per deployment");

  const enabled = String(env.SKILLPASS_ENABLED_SERVICES || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const selected = enabled.length ? services.filter((service) => enabled.includes(service.slug)) : services;
  if (enabled.length && selected.length !== new Set(enabled).size) {
    const known = new Set(services.map((service) => service.slug));
    const unknown = [...new Set(enabled)].filter((slug) => !known.has(slug));
    if (unknown.length) throw new Error(`SKILLPASS_ENABLED_SERVICES contains unknown service(s): ${unknown.join(", ")}`);
  }
  if (!selected.length) throw new Error("SKILLPASS_ENABLED_SERVICES selected no services");
  return createServiceRegistry(selected);
}
