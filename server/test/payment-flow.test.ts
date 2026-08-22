import test from "node:test";
import assert from "node:assert/strict";
import { explorerUrl, incidentFixtures, loadDependencyManifest, verifyResolution } from "../src/services/payment/incident-flow.js";
import { scanDependencies } from "../src/services/security/dependency-scan.js";

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

test("divide fixture reports the arithmetic bug accurately", () => {
  const fixture = incidentFixtures.divide;
  const source = fixture.files.find((file) => file.path === "src/math.ts")?.content;
  const assertion = fixture.files.find((file) => file.path === "src/math.test.ts")?.content;

  assert.ok(source?.includes("return a * b"));
  assert.ok(assertion?.includes("divide(10, 2)).toBe(5)"));
  assert.equal(fixture.error.name, "AssertionError");
  assert.match(fixture.error.message, /Expected 5 but received 20/);
});

test("regional cache fixture keys lookups by user and region", () => {
  const fixture = incidentFixtures["regional-cache"];
  const source = fixture.files.find((file) => file.path === "src/cache/userLookup.ts")?.content;
  const assertion = fixture.files.find((file) => file.path === "src/cache/userLookup.test.ts")?.content;

  assert.ok(source?.includes("const key = userId"));
  assert.ok(assertion?.includes("does not share users between regions"));
  assert.equal(fixture.error.name, "RegionCacheIsolationError");
  assert.match(fixture.error.message, /eu-west profile/);
});

test("provider patch is applied on disk before the fixture test runs", async () => {
  const result = await verifyResolution(incidentFixtures.divide, {
    patch: [{
      path: "src/math.ts",
      diff: "diff --git a/src/math.ts b/src/math.ts\n--- a/src/math.ts\n+++ b/src/math.ts\n@@ -1,3 +1,3 @@\n export function divide(a: number, b: number): number {\n-  return a * b;\n+  return a / b;\n }",
    }],
  });

  assert.equal(result.command, "pnpm exec tsx --test src/math.test.ts");
  assert.deepEqual(result.changed.map((file) => file.path), ["src/math.ts"]);
  assert.match(result.changed[0]?.content || "", /return a \/ b/);
});

test("dependency scan finds current feed data that passing tests cannot detect", () => {
  const result = scanDependencies({
    dependencies: incidentFixtures["dependency-scan"].dependencies || {},
    lockfileVersion: 3,
  });

  assert.equal(result.clean, false);
  assert.equal(result.findings[0]?.package, "demo-xml-parser");
  assert.equal(result.findings[0]?.recommendedVersion, "1.4.1");
  assert.match(result.findings[0]?.vulnerability || "", /THRESHOLD-DEMO/);
});

test("dependency scan reads the fixture manifest and returns zero for a fixed version", async () => {
  const dependencies = await loadDependencyManifest(incidentFixtures["dependency-scan"].manifestPath || "");
  assert.equal(dependencies["demo-xml-parser"], "1.4.0");
  assert.equal(scanDependencies({ dependencies }).findings.length, 1);
  assert.equal(scanDependencies({ dependencies: { "demo-xml-parser": "1.4.1" } }).findings.length, 0);
});
