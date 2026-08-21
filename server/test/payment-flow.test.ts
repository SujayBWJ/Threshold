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

test("incident fixture describes a real tenant-isolation cache bug", () => {
  const source = fixture.files.find((file) => file.path === "src/profile-cache.ts")?.content;
  const assertion = fixture.files.find((file) => file.path === "src/profile-cache.test.ts")?.content;

  assert.ok(source?.includes("const key = userId"));
  assert.ok(assertion?.includes("does not share profiles between tenants"));
  assert.equal(fixture.error.name, "TenantIsolationError");
  assert.match(fixture.error.message, /acme-eu profile/);
});
