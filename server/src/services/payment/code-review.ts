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
config({ path: resolve(__dirname, "../../../../.env") });
config({ path: resolve(__dirname, "../../../.env"), override: true });

const algorandTestnetNetwork =
  `algorand:${ALGORAND_TESTNET_GENESIS_HASH}` as Network;

type Settlement = {
  transaction?: string;
  txHash?: string;
  payer?: string;
  network?: string;
};

async function getSecretKeyFromMnemonic(mnemonic: string): Promise<string> {
  const seed = seedFromMnemonic(mnemonic);
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

export async function reviewWithPayment(
  code: string,
  language: string,
): Promise<{ data: unknown; settlement: Settlement | null }> {
  const mnemonic = process.env.AVM_MNEMONIC?.trim();
  if (!mnemonic) {
    throw new Error("Missing AVM_MNEMONIC in .env");
  }

  const secretKey = await getSecretKeyFromMnemonic(mnemonic);
  const avmSigner = toClientAvmSigner(secretKey);
  const expectedPayer = process.env.AVM_PAYER_ADDRESS?.trim();
  if (expectedPayer && expectedPayer !== avmSigner.address) {
    throw new Error(
      `AVM_MNEMONIC does not match AVM_PAYER_ADDRESS (${expectedPayer})`,
    );
  }

  const client = new x402Client();
  const scheme = new ExactAvmScheme(avmSigner);
  client.register(ALGORAND_TESTNET_CAIP2, scheme);
  client.register(algorandTestnetNetwork, scheme);
  client.register("algorand:*" as Network, scheme);

  const baseUrl = `http://localhost:${process.env.PORT?.trim() || "4021"}`;
  const response = await wrapFetchWithPayment(fetch, client)(
    `${baseUrl}/api/code-review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, language }),
    },
  );

  const data: unknown = await response.json();
  if (!response.ok) {
    const errorMessage =
      typeof data === "object" && data !== null && "error" in data
        ? data.error
        : undefined;
    throw new Error(
      typeof errorMessage === "string"
        ? errorMessage
        : `Paid request failed (${response.status})`,
    );
  }

  const paymentResponse = new x402HTTPClient(client).getPaymentSettleResponse(
    (name) => response.headers.get(name),
  );
  const settlement =
    paymentResponse && typeof paymentResponse === "object"
      ? (paymentResponse as Settlement)
      : null;

  return { data, settlement };
}
