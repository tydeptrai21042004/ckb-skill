const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g;

export function cleanPlainText(value, { fallback = "request failed", maxLength = 320 } = {}) {
  let text = String(value ?? "")
    .replace(CONTROL_CHARS, "")
    .replace(BIDI_CONTROLS, "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  if (!text) text = fallback;
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
}

export function publicErrorMessage(error, fallback = "request failed") {
  return cleanPlainText(error?.message, { fallback, maxLength: 320 });
}

export function assertJsonRequest(req) {
  if (!MUTATING_METHODS.has(String(req.method || "").toUpperCase())) return;
  const mediaType = String(req.headers?.["content-type"] || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType === "application/json" || mediaType.endsWith("+json")) return;
  throw Object.assign(new Error("request content-type must be application/json"), {
    status: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
  });
}

export function rejectCrossSiteBrowserRequest(req) {
  if (!MUTATING_METHODS.has(String(req.method || "").toUpperCase())) return;
  const fetchSite = String(req.headers?.["sec-fetch-site"] || "").trim().toLowerCase();
  // Non-browser clients generally omit Fetch Metadata headers. Browsers that
  // identify a request as cross-site are rejected before any state-changing
  // route, which blocks ordinary CSRF/form and XSS-assisted cross-origin calls.
  if (fetchSite === "cross-site") {
    throw Object.assign(new Error("cross-site browser requests are not allowed"), {
      status: 403,
      code: "CROSS_SITE_REQUEST_DENIED",
    });
  }
}

export function safeRequestUrl(req) {
  // Route parsing must never trust Host/X-Forwarded-Host. Public absolute URLs
  // are constructed separately, only from validated deployment/proxy config.
  return new URL(String(req.url || "/"), "http://skillpass.invalid");
}

export function baseSecurityHeaders({ contentType, csp, trustedTypesReportOnly = false } = {}) {
  const headers = {
    "content-type": contentType || "application/octet-stream",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "x-permitted-cross-domain-policies": "none",
    "cross-origin-resource-policy": "same-origin",
  };
  if (csp) headers["content-security-policy"] = csp;
  if (trustedTypesReportOnly) {
    headers["content-security-policy-report-only"] = "require-trusted-types-for 'script'; trusted-types 'none'";
  }
  return headers;
}
