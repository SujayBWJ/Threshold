/**
 * One-time TestNet USDC (ASA 10458941) opt-in for provider wallets.
 * Never prints mnemonics or private keys.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AlgorandClient } from "@algorandfoundation/algokit-utils/algorand-client";
import { USDC_TESTNET_ASA_ID } from "@x402/avm";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const USDC_ASA = BigInt(USDC_TESTNET_ASA_ID);

const PROVIDERS = [
  {
    label: "Provider A (Code Review)",
    mnemonicKey: "PROVIDER_CODE_REVIEW_MNEMONIC",
    addressKey: "PROVIDER_CODE_REVIEW_ADDRESS",
  },
  {
    label: "Provider B (Summarize)",
    mnemonicKey: "PROVIDER_SUMMARIZE_MNEMONIC",
    addressKey: "PROVIDER_SUMMARIZE_ADDRESS",
  },
] as const;

async function isOptedIn(
  algorand: AlgorandClient,
  address: string,
): Promise<boolean> {
  const info = await algorand.account.getInformation(address);
  return Boolean(
    info.assets?.find((a) => String(a.assetId) === USDC_TESTNET_ASA_ID),
  );
}

async function main(): Promise<void> {
  const algorand = AlgorandClient.testNet();

  console.log("=== Opt provider wallets into TestNet USDC ===\n");
  console.log(`USDC ASA: ${USDC_TESTNET_ASA_ID}\n`);

  for (const provider of PROVIDERS) {
    const mnemonic = process.env[provider.mnemonicKey]?.trim();
    const expectedAddress = process.env[provider.addressKey]?.trim();

    if (!mnemonic) {
      console.error(`Missing ${provider.mnemonicKey}. Run generate-provider-accounts.ts first.`);
      process.exit(1);
    }
    if (!expectedAddress) {
      console.error(`Missing ${provider.addressKey}.`);
      process.exit(1);
    }

    const account = algorand.account.fromMnemonic(mnemonic);
    const address = account.addr.toString();

    if (address !== expectedAddress) {
      console.error(
        `${provider.mnemonicKey} does not match ${provider.addressKey}.\n  derived:  ${address}\n  expected: ${expectedAddress}`,
      );
      process.exit(1);
    }

    console.log(`${provider.label}: ${address}`);

    const alreadyOptedIn = await isOptedIn(algorand, address);
    if (alreadyOptedIn) {
      console.log("  Already opted into USDC.\n");
      continue;
    }

    console.log("  Submitting ASA opt-in...");
    const results = await algorand.asset.bulkOptIn(address, [USDC_ASA]);
    for (const result of results) {
      console.log(`  Transaction ID: ${result.transactionId}`);
    }

    const optedIn = await isOptedIn(algorand, address);
    console.log(`  USDC opt-in status: ${optedIn}\n`);

    if (!optedIn) {
      console.error("  Opt-in completed but account still not opted in.");
      process.exit(1);
    }
  }

  console.log("All provider wallets opted into USDC.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
