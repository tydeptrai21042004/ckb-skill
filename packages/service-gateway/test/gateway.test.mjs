import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, createServiceRegistry, validateServiceInput } from "../src/index.mjs";

const ID1 = `0x${"11".repeat(32)}`;
const ID2 = `0x${"22".repeat(32)}`;

test("canonicalJson is stable across object key order", () => {
  assert.equal(canonicalJson({ b: 2, a: { z: true, y: [2, 1] } }), canonicalJson({ a: { y: [2, 1], z: true }, b: 2 }));
});

test("service registry rejects duplicate identity and exposes no execute function publicly", () => {
  const registry = createServiceRegistry([{ slug: "one", id: ID1, execute: async () => ({ ok: true }) }]);
  assert.equal(registry.getBySlug("one").id, ID1);
  assert.equal("execute" in registry.publicList()[0], false);
  assert.throws(() => createServiceRegistry([
    { slug: "one", id: ID1, execute() {} },
    { slug: "two", id: ID1, execute() {} },
  ]), /duplicate service id/i);
});

test("service input validation handles text and JSON bounds", () => {
  const registry = createServiceRegistry([
    { slug: "text", id: ID1, inputKind: "text", maxInputChars: 5, execute() {} },
    { slug: "json", id: ID2, inputKind: "json", maxInputChars: 20, execute() {} },
  ]);
  assert.equal(validateServiceInput(registry.getBySlug("text"), "hello"), "hello");
  assert.throws(() => validateServiceInput(registry.getBySlug("text"), "toolong"), /exceeds/i);
  assert.deepEqual(validateServiceInput(registry.getBySlug("json"), { a: 1 }), { a: 1 });
});


test("service registry requires an explicit invocation-key contract for action services", () => {
  assert.throws(() => createServiceRegistry([{
    slug: "action", id: ID1, operationMode: "idempotent-action", execute() {},
  }]), /idempotencyMode must be invocation-key/);
  const registry = createServiceRegistry([{
    slug: "action", id: ID1, operationMode: "idempotent-action", idempotencyMode: "invocation-key", execute() {},
  }]);
  assert.equal(registry.getBySlug("action").operationMode, "idempotent-action");
  assert.equal(registry.getBySlug("action").idempotencyMode, "invocation-key");
  assert.throws(() => createServiceRegistry([{
    slug: "unsafe", id: ID2, operationMode: "write", execute() {},
  }]), /operationMode must be read or idempotent-action/);
});
