import test from "node:test";
import assert from "node:assert/strict";
import {
  assertJsonRequest,
  baseSecurityHeaders,
  cleanPlainText,
  publicErrorMessage,
  rejectCrossSiteBrowserRequest,
  safeRequestUrl,
} from "../src/index.mjs";

test("cleanPlainText removes control and bidi characters and caps attacker-controlled errors", () => {
  const value = cleanPlainText("bad\r\nX-Fake: injected\u202E\u0000" + "x".repeat(500));
  assert.doesNotMatch(value, /[\r\n\u0000\u202E]/);
  assert.ok(value.length <= 320);
  assert.match(value, /X-Fake: injected/);
});

test("publicErrorMessage uses a non-empty fallback", () => {
  assert.equal(publicErrorMessage({ message: "\r\n\u0000" }), "request failed");
});

test("assertJsonRequest accepts application/json and +json media types", () => {
  assert.doesNotThrow(() => assertJsonRequest({ method: "POST", headers: { "content-type": "application/json; charset=utf-8" } }));
  assert.doesNotThrow(() => assertJsonRequest({ method: "PATCH", headers: { "content-type": "application/problem+json" } }));
});

test("assertJsonRequest rejects form/text bodies before route parsing", () => {
  for (const contentType of ["", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
    assert.throws(
      () => assertJsonRequest({ method: "POST", headers: { "content-type": contentType } }),
      (error) => error.status === 415 && error.code === "UNSUPPORTED_MEDIA_TYPE",
    );
  }
});

test("rejectCrossSiteBrowserRequest blocks Fetch-Metadata cross-site mutations but allows API clients", () => {
  assert.throws(
    () => rejectCrossSiteBrowserRequest({ method: "POST", headers: { "sec-fetch-site": "cross-site" } }),
    (error) => error.status === 403 && error.code === "CROSS_SITE_REQUEST_DENIED",
  );
  assert.doesNotThrow(() => rejectCrossSiteBrowserRequest({ method: "POST", headers: {} }));
  assert.doesNotThrow(() => rejectCrossSiteBrowserRequest({ method: "POST", headers: { "sec-fetch-site": "same-origin" } }));
});

test("safeRequestUrl does not use an attacker-controlled Host header", () => {
  const url = safeRequestUrl({ url: "/api/analyze?x=1", headers: { host: "<script>alert(1)</script>" } });
  assert.equal(url.origin, "http://skillpass.invalid");
  assert.equal(url.pathname, "/api/analyze");
  assert.equal(url.searchParams.get("x"), "1");
});

test("baseSecurityHeaders emits browser-hardening headers", () => {
  const headers = baseSecurityHeaders({
    contentType: "text/html; charset=utf-8",
    csp: "default-src 'self'; object-src 'none'",
    trustedTypesReportOnly: true,
  });
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["cross-origin-resource-policy"], "same-origin");
  assert.match(headers["content-security-policy"], /object-src 'none'/);
  assert.match(headers["content-security-policy-report-only"], /require-trusted-types-for 'script'/);
});
