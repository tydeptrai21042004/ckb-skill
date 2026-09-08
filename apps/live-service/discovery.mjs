function normalizeServices({ services, serviceId, maxInputChars = 20_000 } = {}) {
  if (Array.isArray(services) && services.length) return services;
  return [{
    id: serviceId,
    slug: "paper-analyzer-v1",
    name: "Paper Analyzer",
    description: "Protected paper analysis",
    endpoint: "/api/analyze",
    inputKind: "text",
    maxInputChars,
    kind: "builtin",
  }];
}

export function buildDiscovery({ deployment, services, serviceId, trustedIssuerId, trustedIssuerIds, policy, payments, maxInputChars = 20_000 } = {}) {
  const issuers = Array.isArray(trustedIssuerIds) && trustedIssuerIds.length ? trustedIssuerIds : (trustedIssuerId ? [trustedIssuerId] : []);
  const list = normalizeServices({ services, serviceId, maxInputChars });
  return Object.freeze({
    schemaVersion: "2.0",
    product: "SkillPass",
    positioning: "portable CKB service rights + optional Fiber/x402 usage settlement",
    service: {
      id: list[0]?.id,
      name: list[0]?.slug || "paper-analyzer-v1",
      endpoint: list[0]?.endpoint || "/api/analyze",
      method: "POST",
      maxInputChars: list[0]?.maxInputChars || maxInputChars,
    },
    services: list.map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.name,
      description: service.description,
      endpoint: service.endpoint || `/api/invoke/${service.slug}`,
      method: "POST",
      inputKind: service.inputKind,
      maxInputChars: service.maxInputChars,
      kind: service.kind,
      policyId: service.policyId,
      policyFingerprint: service.policyFingerprint,
      payment: service.payment || { required: false },
    })),
    chain: {
      network: "ckb-testnet",
      authorizationModel: "current-live-capability-cell-owner",
      capabilityTypeScript: deployment,
      trustedIssuerId: issuers[0] || null,
      trustedIssuerIds: issuers,
      issuerRotationSupported: issuers.length > 1,
      providerPolicy: policy ? {
        id: policy.id,
        fingerprint: policy.fingerprint || null,
        transferableRequired: Boolean(policy.transferableRequired),
        termsHash: policy.termsHash || null,
        url: policy.url || null,
      } : undefined,
    },
    authentication: {
      scheme: "ckb-wallet-one-time-intent-challenge",
      challengeEndpoint: "/api/challenge",
      signatureRequired: true,
      intentBinding: ["action", "service", "capability_outpoint", "request_hash", "policy_fingerprint", "delegation_id"],
      privateKeyLocation: "user-wallet-only",
    },
    delegation: {
      supported: true,
      model: "owner-signed-grant",
      versions: [1, 2],
      maxLifetimeSeconds: 86400,
      scope: ["service", "capability", "outpoint", "delegate", "action", "expiry", "optional-use-limit", "optional-spend-limit"],
      invalidation: "automatic when capability outpoint is consumed/transferred or grant expires",
      custody: "owner retains capability; delegate never receives ownership",
    },
    payment: payments?.required ? {
      required: true,
      protocol: "x402",
      x402Version: 2,
      rail: "fiber",
      network: payments.network,
      amount: payments.amount,
      asset: payments.asset,
      proofMode: payments.proofMode,
      quoteReuse: "same-bound-request-until-expiry",
    } : { required: false },
    health: {
      liveness: "/livez",
      readiness: "/readyz",
      status: "/api/status",
      capabilityStatus: "/api/capability/status",
    },
    api: {
      openapi: "/api/openapi.json",
      runtimeConfig: "/api/config",
      services: "/api/services",
      agentSpec: "/.well-known/skillpass-agent.txt",
    },
  });
}

export function buildOpenApi({ services, paymentsRequired = false, maxInputChars = 20_000 } = {}) {
  const legacyOnly = !(Array.isArray(services) && services.length);
  const list = normalizeServices({ services, serviceId: undefined, maxInputChars });
  const outPointSchema = { type: "object", required: ["txHash", "index"], properties: { txHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" }, index: { type: "string" } } };
  const signatureSchema = { type: "object", description: "CCC wallet message signature object" };
  const delegationSchema = {
    type: "object",
    required: ["grant", "ownerSignature"],
    properties: {
      grant: { type: "object", description: "Owner-signed service/capability/delegate/action/expiry grant" },
      ownerSignature: signatureSchema,
    },
  };
  const paths = {
    "/api/status": { get: { summary: "Read sanitized service status", responses: { "200": { description: "Service alive" } } } },
    "/api/services": { get: { summary: "List protected services", responses: { "200": { description: "Public service catalog" } } } },
    "/api/capability/status": {
      post: {
        summary: "Inspect a SkillPass capability from fresh CKB state and return an evidence bundle",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["outPoint"], properties: { outPoint: outPointSchema } } } } },
        responses: { "200": { description: "Capability is live and satisfies its registered provider policy" }, "403": { description: "Capability is consumed or violates service policy" } },
      },
    },
    "/api/challenge": {
      post: {
        summary: "Create a one-time owner or delegate wallet intent-signature challenge",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["address", "outPoint", "requestHash"], properties: { address: { type: "string" }, outPoint: outPointSchema, requestHash: { type: "string", pattern: "^[0-9a-fA-F]{64}$" }, service: { type: "string" }, delegationId: { type: "string", pattern: "^[0-9a-fA-F]{32}$" } } } } } },
        responses: { "200": { description: "Intent-bound challenge created" } },
      },
    },
  };

  for (const service of list) {
    const endpoint = service.endpoint || `/api/invoke/${service.slug}`;
    const inputSchema = service.inputKind === "text"
      ? { type: "string", minLength: 1, maxLength: service.maxInputChars || maxInputChars }
      : {};
    paths[endpoint] = {
      post: {
        summary: `Invoke ${service.name || service.slug} with live CKB ownership or an owner-signed delegation`,
        description: paymentsRequired ? "May return HTTP 402 with PAYMENT-REQUIRED before protected execution." : "Payment is disabled in this deployment.",
        parameters: paymentsRequired ? [{ name: "PAYMENT-SIGNATURE", in: "header", required: false, schema: { type: "string" } }] : [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            required: legacyOnly && endpoint === "/api/analyze" ? ["address", "nonce", "signature", "outPoint", "text"] : ["address", "nonce", "signature", "outPoint", "input"],
            properties: {
              address: { type: "string" },
              nonce: { type: "string" },
              signature: signatureSchema,
              outPoint: outPointSchema,
              input: inputSchema,
              ...(legacyOnly && endpoint === "/api/analyze" ? { text: inputSchema } : {}),
              delegation: delegationSchema,
            },
          } } },
        },
        responses: {
          "200": { description: "Authorized protected result" },
          ...(paymentsRequired ? { "402": { description: "Fiber/x402 payment required" } } : {}),
          "401": { description: "Owner/delegate signature, challenge, or delegation rejected" },
          "403": { description: "Capability missing, expired, wrong service, untrusted issuer, non-portable, or current owner invalid" },
        },
      },
    };
  }

  // Preserve the original v1 alias for existing clients.
  if (!paths["/api/analyze"]) {
    paths["/api/analyze"] = { post: { summary: "Backward-compatible alias for paper-analyzer-v1", responses: { "200": { description: "Authorized analysis" } } } };
  }

  return Object.freeze({
    openapi: "3.1.0",
    info: {
      title: "SkillPass protected service gateway API",
      version: "1.2.0",
      description: "Multi-service portable CKB service-right authorization with owner-signed budgeted agent delegation and optional Fiber/x402 per-use payment.",
    },
    paths,
  });
}


export function buildAgentSpec({ services = [], paymentsRequired = false } = {}) {
  const lines = [
    "SkillPass Agent Protocol v1.2",
    "Purpose: invoke services protected by a live transferable CKB Capability without giving the service or agent custody of the owner private key.",
    "Discovery: GET /.well-known/skillpass.json and GET /api/services.",
    "1. Select a service and a live Capability whose serviceId matches it.",
    "2. Hash the exact service input with SHA-256 (stable canonical JSON for JSON inputs).",
    "3. POST /api/challenge with acting CKB address, capability outPoint, requestHash, service slug, and delegationId when delegated.",
    "4. Sign the returned challenge message with the acting wallet. Never reuse a nonce.",
    "5. POST the signed body to the service endpoint. Direct use requires the signer to own the live Capability Cell. Delegated use also includes the owner-signed delegation credential.",
    "6. Delegation v2 can cap maximum calls and total Fiber atomic-unit spend. Transfer/consumption of the bound Capability outPoint invalidates the grant automatically.",
    paymentsRequired
      ? "7. If HTTP 402 is returned, pay the supplied Fiber/x402 requirement, obtain a FRESH wallet challenge, then retry with PAYMENT-SIGNATURE."
      : "7. This deployment does not require Fiber/x402 payment.",
    "Authorization order: fresh intent signature -> live CKB Cell/policy -> delegation scope/budget -> optional Fiber payment -> protected service.",
    "Do not send private keys. Treat exported delegation credentials as bearer-sensitive authorization material until expiry or Capability transfer.",
  ];
  if (services.length) lines.push(`Services: ${services.map((service) => `${service.slug} (${service.endpoint || `/api/invoke/${service.slug}`})`).join(", ")}.`);
  return `${lines.join("\n")}\n`;
}
