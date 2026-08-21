import test from "node:test";
import assert from "node:assert/strict";
import { explorerUrl, fixture } from "../src/services/payment/incident-flow.js";

test("builds the required Lora TestNet transaction URL", () => {
  const transaction = "ABC123+/=";
  assert.equal(
    explorerUrl(transaction, true),
    "https://lora.algokit.io/testnet/transaction/ABC123%2B%2F%3D",
  );
});

test("builds the Lora MainNet transaction URL", () => {
  assert.equal(
    explorerUrl("ABC123", false),
    "https://lora.algokit.io/mainnet/transaction/ABC123",
  );
});

test("incident fixture matches the returned arithmetic diagnosis", () => {
  const source = fixture.files.find((file) => file.path === "src/math.ts")?.content;
  const assertion = fixture.files.find((file) => file.path === "src/math.test.ts")?.content;

  assert.ok(source?.includes("a * b"));
  assert.ok(assertion?.includes("divide(10, 2)).toBe(5)"));
  assert.equal(fixture.error.message, "Expected 5 but received 20");
});
