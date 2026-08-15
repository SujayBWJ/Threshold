import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { Network, ResourceServerExtension } from "@x402/core/types";
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

/**
 * GoPlausible currently advertises Algorand networks using the full genesis-hash
 * CAIP-2 form. @x402/avm's ALGORAND_TESTNET_CAIP2 is the truncated canonical form.
 * Route `network` must match facilitator /supported exactly.
 */
const ALGORAND_TESTNET_NETWORK =
  `algorand:${ALGORAND_TESTNET_GENESIS_HASH}` as Network;

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
        accepts: [
          {
            scheme: "exact",
            price,
            network: ALGORAND_TESTNET_NETWORK,
            payTo: avmAddress,
            extra: { asset: USDC_TESTNET_ASA_ID },
          },
        ],
        description: "Threshold x402 payment gate test endpoint",
        mimeType: "application/json",
        extensions: testDiscovery,
      },
    },
    server,
  ),
);

app.get("/api/test", (c) => {
  return c.json({
    project: "Threshold",
    endpoint: "/api/test",
    paid: true,
    message: "Payment verified. Test gate unlocked.",
  });
});

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
