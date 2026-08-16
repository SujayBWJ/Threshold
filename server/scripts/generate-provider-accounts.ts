/**
 * Generates dedicated TestNet provider wallets for API payment routing.
 * Writes mnemonics to .env for one-time opt-in setup; never prints secrets.
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

type ProviderSpec = {
  label: string;
  mnemonicKey: string;
  addressKey: string;
};

const PROVIDERS: ProviderSpec[] = [
  {
    label: "Provider A (Code Review / DevTools Inc)",
    mnemonicKey: "PROVIDER_CODE_REVIEW_MNEMONIC",
    addressKey: "PROVIDER_CODE_REVIEW_ADDRESS",
  },
  {
    label: "Provider B (Summarize / TextFlow AI)",
    mnemonicKey: "PROVIDER_SUMMARIZE_MNEMONIC",
    addressKey: "PROVIDER_SUMMARIZE_ADDRESS",
  },
];

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

  console.log("=== Generate provider TestNet wallets ===\n");

  for (const provider of PROVIDERS) {
    let mnemonic = process.env[provider.mnemonicKey]?.trim();
    if (!mnemonic) {
      mnemonic = generateMnemonic();
      content = upsertEnv(content, provider.mnemonicKey, mnemonic);
    }

    const address = await addressFromMnemonic(mnemonic);
    if (!isValidAlgorandAddress(address)) {
      throw new Error(`Generated address failed validation for ${provider.label}`);
    }

    content = upsertEnv(content, provider.addressKey, address);
    console.log(`${provider.label}`);
    console.log(`  ${provider.addressKey}: ${address}`);
    console.log(`  (${provider.mnemonicKey} written to .env only)\n`);
  }

  writeFileSync(envPath, content, "utf8");
  console.log("Provider wallets ready. Run fund-providers.ts then opt-in-providers.ts.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
