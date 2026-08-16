import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { testRouter } from "./src/routes/test.js";
import { codeReviewRouter } from "./src/routes/code-review.js";
import { getBasePaymentRequirement, ALGORAND_TESTNET_NETWORK } from "./src/config/payment.js";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { ResourceServerExtension } from "@x402/core/types";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import {
  ALGORAND_TESTNET_CAIP2,
  ALGORAND_TESTNET_GENESIS_HASH,
  USDC_TESTNET_ASA_ID,
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
const facilitatorUrl = requireEnv("FACILITATOR_URL");
const price = process.env.X402_PRICE?.trim() || "$0.001";
const port = Number(process.env.PORT) || 4021;

if (!isValidAlgorandAddress(avmAddress)) {
  console.error(
    "Invalid AVM_ADDRESS: must be a valid Algorand public address (payTo receiver).",
  );
  process.exit(1);
}

if (process.env.X402_NETWORK && process.env.X402_NETWORK !== "testnet") {
  console.error(
    'Invalid X402_NETWORK: Chunk 2 only supports "testnet". Do not use MainNet yet.',
  );
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

// Register truncated + full TestNet IDs so scheme lookup works either way.
const avmScheme = new ExactAvmScheme();
server.register(ALGORAND_TESTNET_CAIP2, avmScheme);
server.register(ALGORAND_TESTNET_NETWORK, avmScheme);
server.registerExtension(
  bazaarResourceServerExtension as unknown as ResourceServerExtension,
);

const testDiscovery = declareDiscoveryExtension({
  output: {
    example: {
      project: "Threshold",
      endpoint: "/api/test",
      paid: true,
    },
  },
});

const codeReviewDiscovery = declareDiscoveryExtension({
  input: {
    method: "POST",
  },
  output: {
    example: {
      project: "Threshold",
      api: "Code Review",
      method: "POST",
      endpoint: "/api/code-review",
      description: "AI-powered code review API",
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
      price: "$0.001 USDC per request",
      network: "Algorand TestNet",
      asset: "USDC ASA 10458941",
    }
  },
});

const app = new Hono();

app.get("/", (c) => {
  return c.json({
    project: "Threshold",
    team: "Interstice",
    status: "running",
  });
});

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
        accepts: [getBasePaymentRequirement(price, avmAddress)],
        description: "Threshold AI Code Review endpoint",
        mimeType: "application/json",
        extensions: codeReviewDiscovery,
      },
    },
    server,
  ),
);

app.route("/api/test", testRouter);
app.route("/api/code-review", codeReviewRouter);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Threshold server running at http://localhost:${info.port}`);
    console.log(`Network: Algorand TestNet (${ALGORAND_TESTNET_NETWORK})`);
    console.log(`USDC ASA: ${USDC_TESTNET_ASA_ID}`);
    console.log(`payTo: ${avmAddress}`);
    console.log(`price: ${price}`);
  },
);
