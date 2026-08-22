import test from "node:test";
import assert from "node:assert/strict";
import { divide } from "./math.js";

test("divides two numbers", () => {
  assert.equal(divide(10, 2), 5);
});
