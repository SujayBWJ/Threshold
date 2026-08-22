import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "./index.js";

test("parses a document", () => {
  assert.equal(parseDocument(" safe "), "safe");
});