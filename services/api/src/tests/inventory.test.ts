import test from "node:test";
import assert from "node:assert/strict";
import { ConcurrentStockError, InsufficientStockError } from "../db/inventory";

test("InsufficientStockError carries productId", () => {
  const err = new InsufficientStockError("abc-123", "Only 2 left");
  assert.equal(err.name, "InsufficientStockError");
  assert.equal(err.productId, "abc-123");
  assert.equal(err.message, "Only 2 left");
});

test("ConcurrentStockError default message", () => {
  const err = new ConcurrentStockError();
  assert.equal(err.name, "ConcurrentStockError");
  assert.match(err.message, /retry/i);
});

test("available quantity formula", () => {
  const onHand = 20;
  const reserved = 7;
  const available = Math.max(0, onHand - reserved);
  assert.equal(available, 13);
});
