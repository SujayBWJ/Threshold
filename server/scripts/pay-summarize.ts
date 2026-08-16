/**
 * End-to-end x402 TestNet payment client for POST /api/summarize.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import {
  toClientAvmSigner,
  ExactAvmScheme,
  ALGORAND_TESTNET_CAIP2,
  ALGORAND_TESTNET_GENESIS_HASH,
} from "@x402/avm";
import {
  ed25519SigningKeyFromWrappedSecret,
  type WrappedEd25519Seed,
} from "@algorandfoundation/algokit-utils/crypto";
import { seedFromMnemonic } from "@algorandfoundation/algokit-utils/algo25";
import type { Network } from "@x402/core/types";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const ALGORAND_TESTNET_NETWORK =
  `algorand:${ALGORAND_TESTNET_GENESIS_HASH}` as Network;

const baseUrl = process.env.THRESHOLD_URL?.trim() || "http://localhost:4021";
const testUrl = `${baseUrl.replace(/\/$/, "")}/api/summarize`;

type PaymentRequiredBody = {
  x402Version?: number;
  accepts?: Array<{
    scheme?: string;
    network?: string;
    amount?: string;
    asset?: string;
    payTo?: string;
  }>;
};

async function getSecretKeyFromMnemonic(avmMnemonic: string): Promise<string> {
  const seed = seedFromMnemonic(avmMnemonic);
  const seedCopy = new Uint8Array(seed);

  const wrappedSeed: WrappedEd25519Seed = {
    unwrapEd25519Seed: async () => seed,
    wrapEd25519Seed: async () => {},
  };

  const wrappedSecret = await ed25519SigningKeyFromWrappedSecret(wrappedSeed);

  return Buffer.concat([
    Buffer.from(seedCopy),
    Buffer.from(wrappedSecret.ed25519Pubkey),
  ]).toString("base64");
}

function decodePaymentRequired(header: string | null): PaymentRequiredBody | null {
  if (!header) return null;
  try {
    const json = Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(json) as PaymentRequiredBody;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const mnemonic = process.env.AVM_MNEMONIC?.trim();
  if (!mnemonic) {
    console.error("Missing AVM_MNEMONIC in .env");
    process.exit(1);
  }

  console.log("=== Threshold x402 payment test for Text Summarization ===");
  console.log(`Target: ${testUrl}`);

  const postBody = JSON.stringify({
    text: "Threshold is an AI API marketplace that uses x402 payments on Algorand TestNet. Clients pay $0.001 USDC per request, the GoPlausible facilitator verifies and settles the payment, and then the API returns an AI-generated response.",
  });

  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: postBody,
  };

  console.log("\n[1] POST /api/summarize without payment");
  const unpaid = await fetch(testUrl, requestOptions);
  console.log(`    HTTP ${unpaid.status} ${unpaid.statusText}`);
  if (unpaid.status !== 402) {
    throw new Error(`Expected HTTP 402, got ${unpaid.status}`);
  }

  const requirements = decodePaymentRequired(
    unpaid.headers.get("payment-required"),
  );
  const accept = requirements?.accepts?.[0];
  console.log("    Payment required");
  if (accept) {
    console.log(`    scheme:  ${accept.scheme}`);
    console.log(`    network: ${accept.network}`);
    console.log(`    asset:   ${accept.asset}`);
    console.log(`    amount:  ${accept.amount}`);
    console.log(`    payTo:   ${accept.payTo}`);
  } else {
    console.log("    (could not decode payment-required header)");
  }

  console.log("\n[2] Load payer signer from AVM_MNEMONIC");
  const secretKey = await getSecretKeyFromMnemonic(mnemonic);
  const avmSigner = toClientAvmSigner(secretKey);
  console.log(`    Payer: ${avmSigner.address}`);

  const expectedPayer = process.env.AVM_PAYER_ADDRESS?.trim();
  if (expectedPayer && expectedPayer !== avmSigner.address) {
    throw new Error(
      `AVM_MNEMONIC does not match AVM_PAYER_ADDRESS (${expectedPayer})`,
    );
  }

  console.log("\n[3] Register ExactAvmScheme on Algorand TestNet");
  const client = new x402Client();
  const scheme = new ExactAvmScheme(avmSigner);
  client.register(ALGORAND_TESTNET_CAIP2, scheme);
  client.register(ALGORAND_TESTNET_NETWORK, scheme);
  client.register("algorand:*" as Network, scheme);
  console.log("    Schemes registered");

  console.log("\n[4] Request with x402 payment wrapper");
  console.log("    (on 402: construct/sign USDC payment, settle via facilitator, retry)");
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const response = await fetchWithPayment(testUrl, requestOptions);
  console.log(`    Final HTTP ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const body = await response.text();
    console.error("\nPaid request failed.");
    console.error(body.slice(0, 800));
    process.exit(1);
  }

  console.log("\n[5] Read settlement proof from response headers");
  const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(
    (name) => response.headers.get(name),
  );

  const data = (await response.json()) as {
    success?: boolean;
    summary?: string;
  };

  console.log("    Payment settled");
  if (paymentResponse && typeof paymentResponse === "object") {
    const settled = paymentResponse as {
      success?: boolean;
      transaction?: string;
      txHash?: string;
      payer?: string;
      network?: string;
    };
    const tx = settled.transaction ?? settled.txHash ?? "unknown";
    console.log(`    Transaction ID: ${tx}`);
    if (typeof settled.success === "boolean") {
      console.log(`    Settlement success: ${settled.success}`);
    }
    if (settled.payer) console.log(`    Settled payer: ${settled.payer}`);
    if (settled.network) console.log(`    Network: ${settled.network}`);
  } else {
    console.log("    Transaction ID: (settlement header missing)");
  }

  console.log("\n[6] API response");
  console.log(`    success: ${data.success}`);
  console.log(`    summary: ${data.summary}`);
  console.log(`\nDone. Final HTTP status: ${response.status}`);
}

main().catch((error: unknown) => {
  const err = error as {
    response?: { data?: { error?: string } };
    message?: string;
    cause?: unknown;
  };
  console.error("\nERROR:");
  console.error(err?.response?.data?.error ?? err?.message ?? error);
  if (err?.cause) console.error("Cause:", err.cause);
  process.exit(1);
});
