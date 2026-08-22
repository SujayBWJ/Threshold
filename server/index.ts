import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { testRouter } from "./src/routes/test.js";
import { codeReviewRouter } from "./src/routes/code-review.js";
import { codeReviewPaidRouter } from "./src/routes/code-review-paid.js";
import { summarizeRouter } from "./src/routes/summarize.js";
import { summarizePaidRouter } from "./src/routes/summarize-paid.js";
import { catalogRouter } from "./src/routes/catalog.js";
import { agentRouter } from "./src/routes/agent.js";
import { resolveIncidentRouter } from "./src/routes/resolve-incident.js";
import { scanDependenciesRouter } from "./src/routes/scan-dependencies.js";
import {
  getBasePaymentRequirement,
  getPaymentPrice,
  ALGORAND_TESTNET_NETWORK,
  ALGORAND_MAINNET_NETWORK,
  PAYMENT_NETWORK_LABEL,
  DEFAULT_X402_PRICE,
} from "./src/config/payment.js";
import { runPaymentFlowRouter } from "./src/routes/run-payment-flow.js";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { ResourceServerExtension } from "@x402/core/types";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import {
  ALGORAND_TESTNET_CAIP2,
  ALGORAND_MAINNET_CAIP2,
  isValidAlgorandAddress,
} from "@x402/avm";
import {
  declareDiscoveryExtension,
  bazaarResourceServerExtension,
} from "@x402-avm/extensions";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Load env from repo root then server/ (server wins on conflicts).
config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, ".env"), override: true });

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const avmAddress = requireEnv("AVM_ADDRESS");
const providerCodeReviewAddress = requireEnv("PROVIDER_CODE_REVIEW_ADDRESS");
const providerSummarizeAddress = requireEnv("PROVIDER_SUMMARIZE_ADDRESS");
const providerSecurityScanAddress = process.env.PROVIDER_SECURITY_SCAN_ADDRESS?.trim() || providerCodeReviewAddress;
const facilitatorUrl = requireEnv("FACILITATOR_URL");
const price = getPaymentPrice();
const port = Number(process.env.PORT) || 4021;

if (!isValidAlgorandAddress(avmAddress)) {
  console.error(
    "Invalid AVM_ADDRESS: must be a valid Algorand public address (payTo receiver).",
  );
  process.exit(1);
}

for (const [label, address] of [
  ["PROVIDER_CODE_REVIEW_ADDRESS", providerCodeReviewAddress],
  ["PROVIDER_SUMMARIZE_ADDRESS", providerSummarizeAddress],
  ["PROVIDER_SECURITY_SCAN_ADDRESS", providerSecurityScanAddress],
] as const) {
  if (!isValidAlgorandAddress(address)) {
    console.error(`Invalid ${label}: must be a valid Algorand public address.`);
    process.exit(1);
  }
}

if (process.env.X402_NETWORK && !["testnet", "mainnet"].includes(process.env.X402_NETWORK)) {
  console.error('Invalid X402_NETWORK: expected "mainnet" or "testnet".');
  process.exit(1);
}

if (!price.startsWith("$") || Number.isNaN(Number(price.slice(1)))) {
  console.error(
    'Invalid X402_PRICE: expected a dollar amount like "$0.001".',
  );
  process.exit(1);
}

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
const server = new x402ResourceServer(facilitatorClient);

// Register both networks so TestNet remains an explicit development toggle.
const avmScheme = new ExactAvmScheme();
server.register(ALGORAND_TESTNET_CAIP2, avmScheme);
server.register(ALGORAND_TESTNET_NETWORK, avmScheme);
server.register(ALGORAND_MAINNET_CAIP2, avmScheme);
server.register(ALGORAND_MAINNET_NETWORK, avmScheme);
server.registerExtension(
  bazaarResourceServerExtension as unknown as ResourceServerExtension,
);

// The installed extension runtime accepts HTTP method metadata that its type omits.
const declareHttpDiscovery = (input: Record<string, unknown>) =>
  declareDiscoveryExtension(input as never);

const testDiscovery = declareHttpDiscovery({
  method: "GET",
  input: {},
  output: {
    example: {
      project: "Threshold",
      endpoint: "/api/test",
      paid: true,
    },
  },
});

const codeReviewDiscovery = declareHttpDiscovery({
  method: "POST",
  bodyType: "json",
  input: { code: "string", language: "string" },
  output: {
    example: {
      project: "Threshold",
      api: "Code Review",
      method: "POST",
      endpoint: "/api/code-review",
      description: "AI-powered code review API",
      provider: {
        name: "DevTools Inc",
        walletAddress: providerCodeReviewAddress,
      },
      input: {
        code: "string",
        language: "string",
      },
      output: {
        success: true,
        review: {
          summary: "string",
          score: "number",
          issues: [
            {
              severity: "low",
              title: "string",
              description: "string",
            }
          ],
          suggestions: ["string"],
        }
      },
      price: `${DEFAULT_X402_PRICE} USDC per request`,
      network: PAYMENT_NETWORK_LABEL,
      asset: `USDC ASA ${process.env.X402_NETWORK === "testnet" ? "10458941" : "31566704"}`,
      payTo: providerCodeReviewAddress,
    }
  },
});

const summarizeDiscovery = declareHttpDiscovery({
  method: "POST",
  bodyType: "json",
  input: { text: "string" },
  output: {
    example: {
      project: "Threshold",
      api: "Text Summarizer",
      method: "POST",
      endpoint: "/api/summarize",
      description: "AI-powered text summarization API",
      provider: {
        name: "TextFlow AI",
        walletAddress: providerSummarizeAddress,
      },
      input: {
        text: "string",
      },
      output: {
        success: true,
        summary: "string",
      },
      price: `${DEFAULT_X402_PRICE} USDC per request`,
      network: PAYMENT_NETWORK_LABEL,
      asset: `USDC ASA ${process.env.X402_NETWORK === "testnet" ? "10458941" : "31566704"}`,
      payTo: providerSummarizeAddress,
    },
  },
});

const incidentDiscovery = declareHttpDiscovery({
  method: "POST",
  bodyType: "json",
  input: {
    runtime: "node",
    language: "typescript",
    error: { name: "TypeError", message: "...", stack: "..." },
    files: [{ path: "src/index.ts", content: "..." }],
    constraints: { must_return_patch: true, run_tests: true },
  },
  output: {
    example: {
      project: "Threshold",
      api: "Incident Resolution",
      method: "POST",
      endpoint: "/api/resolve-incident",
      description: "Structured debugging and patch generation for autonomous agents",
      input: {
        runtime: "node",
        language: "typescript",
        error: { name: "TypeError", message: "...", stack: "..." },
        files: [{ path: "src/index.ts", content: "..." }],
        constraints: { must_return_patch: true, run_tests: true },
      },
      output: {
        success: true,
        resolution: {
          diagnosis: "string",
          confidence: "number",
          patch: [{ path: "string", diff: "unified diff" }],
          verification: { command: "string", expected: "string" },
        },
      },
      price: `${DEFAULT_X402_PRICE} USDC per request`,
      network: PAYMENT_NETWORK_LABEL,
      asset: `USDC ASA ${process.env.X402_NETWORK === "testnet" ? "10458941" : "31566704"}`,
      payTo: providerCodeReviewAddress,
    },
  },
});

const dependencyScanDiscovery = declareHttpDiscovery({
  method: "POST",
  bodyType: "json",
  input: { dependencies: { "package-name": "version" }, lockfileVersion: "number" },
  output: {
    example: {
      project: "Threshold",
      api: "Dependency Vulnerability Scan",
      endpoint: "/api/scan-dependencies",
      description: "Checks pinned dependencies against a current security feed",
      output: { success: true, scan: { findings: [], clean: true } },
    },
  },
});

const app = new Hono();

app.use("/*", serveStatic({ root: "./public" }));

app.route("/api/catalog", catalogRouter);
app.route("/api/agent", agentRouter);
app.route("/api/agent/run-payment-flow", runPaymentFlowRouter);

app.use(
  paymentMiddleware(
    {
      "GET /api/test": {
        accepts: [getBasePaymentRequirement(price, avmAddress)],
        description: "Threshold x402 payment gate test endpoint",
        mimeType: "application/json",
        extensions: testDiscovery,
      },
      "POST /api/code-review": {
        accepts: [getBasePaymentRequirement(price, providerCodeReviewAddress)],
        description: "Threshold AI Code Review endpoint (DevTools Inc)",
        mimeType: "application/json",
        extensions: codeReviewDiscovery,
      },
      "POST /api/summarize": {
        accepts: [getBasePaymentRequirement(price, providerSummarizeAddress)],
        description: "Threshold AI Text Summarization endpoint (TextFlow AI)",
        mimeType: "application/json",
        extensions: summarizeDiscovery,
      },
      "POST /api/resolve-incident": {
        accepts: [getBasePaymentRequirement(price, providerCodeReviewAddress)],
        description: "Threshold structured incident resolution endpoint",
        mimeType: "application/json",
        extensions: incidentDiscovery,
      },
      "POST /api/scan-dependencies": {
        accepts: [getBasePaymentRequirement("$0.002", providerSecurityScanAddress)],
        description: "Threshold dependency vulnerability intelligence endpoint",
        mimeType: "application/json",
        extensions: dependencyScanDiscovery,
      },
    },
    server,
  ),
);

app.route("/api/test", testRouter);
app.route("/api/code-review", codeReviewRouter);
app.route("/api/code-review/paid", codeReviewPaidRouter);
app.route("/api/summarize", summarizeRouter);
app.route("/api/summarize/paid", summarizePaidRouter);
app.route("/api/resolve-incident", resolveIncidentRouter);
app.route("/api/scan-dependencies", scanDependenciesRouter);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Threshold server running at http://localhost:${info.port}`);
    console.log(`Network: ${PAYMENT_NETWORK_LABEL}`);
    console.log(`Platform payTo (test): ${avmAddress}`);
    console.log(`Code Review provider: ${providerCodeReviewAddress}`);
    console.log(`Summarize provider: ${providerSummarizeAddress}`);
    console.log(`price: ${price}`);
  },
);
