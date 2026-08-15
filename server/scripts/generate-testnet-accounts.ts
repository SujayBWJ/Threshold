/**
 * Generates dedicated TestNet payer + receiver accounts into .env if missing.
 * Never prints mnemonics or private keys.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mnemonicFromSeed, seedFromMnemonic } from "@algorandfoundation/algokit-utils/algo25";
import {
  ed25519SigningKeyFromWrappedSecret,
  type WrappedEd25519Seed,
} from "@algorandfoundation/algokit-utils/crypto";
import { toClientAvmSigner, isValidAlgorandAddress } from "@x402/avm";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const envPath = resolve(__dirname, "../../.env");

config({ path: envPath });

async function addressFromMnemonic(mnemonic: string): Promise<string> {
  const seed = seedFromMnemonic(mnemonic);
  const seedCopy = new Uint8Array(seed);
  const wrappedSeed: WrappedEd25519Seed = {
    unwrapEd25519Seed: async () => seed,
    wrapEd25519Seed: async () => {},
  };
  const wrappedSecret = await ed25519SigningKeyFromWrappedSecret(wrappedSeed);
  const secretKey = Buffer.concat([
    Buffer.from(seedCopy),
    Buffer.from(wrappedSecret.ed25519Pubkey),
  ]).toString("base64");
  return toClientAvmSigner(secretKey).address;
}

function generateMnemonic(): string {
  return mnemonicFromSeed(randomBytes(32));
}

function upsertEnv(content: string, key: string, value: string): string {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

async function main(): Promise<void> {
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

  let payerMnemonic = process.env.AVM_MNEMONIC?.trim();
  let receiverMnemonic = process.env.AVM_RECEIVER_MNEMONIC?.trim();

  if (!payerMnemonic) {
    payerMnemonic = generateMnemonic();
    content = upsertEnv(content, "AVM_MNEMONIC", payerMnemonic);
  }

  if (!receiverMnemonic) {
    receiverMnemonic = generateMnemonic();
    content = upsertEnv(content, "AVM_RECEIVER_MNEMONIC", receiverMnemonic);
  }

  const payerAddress = await addressFromMnemonic(payerMnemonic);
  const receiverAddress = await addressFromMnemonic(receiverMnemonic);

  if (!isValidAlgorandAddress(payerAddress) || !isValidAlgorandAddress(receiverAddress)) {
    throw new Error("Generated addresses failed validation");
  }

  content = upsertEnv(content, "AVM_ADDRESS", receiverAddress);
  content = upsertEnv(content, "AVM_PAYER_ADDRESS", payerAddress);

  writeFileSync(envPath, content, "utf8");

  console.log("TestNet accounts ready (mnemonics written to .env only).");
  console.log(`Receiver (payTo / AVM_ADDRESS): ${receiverAddress}`);
  console.log(`Payer (AVM_PAYER_ADDRESS):      ${payerAddress}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
