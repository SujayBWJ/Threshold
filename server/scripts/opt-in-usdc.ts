/**
 * One-time TestNet USDC (ASA 10458941) opt-in for the Threshold payer.
 * Does not send USDC. Never prints mnemonics or private keys.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AlgorandClient } from "@algorandfoundation/algokit-utils/algorand-client";
import { USDC_TESTNET_ASA_ID } from "@x402/avm";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const USDC_ASA = BigInt(USDC_TESTNET_ASA_ID);

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
  const mnemonic = process.env.AVM_MNEMONIC?.trim();
  const expectedPayer = process.env.AVM_PAYER_ADDRESS?.trim();

  if (!mnemonic) {
    console.error("Missing AVM_MNEMONIC in .env");
    process.exit(1);
  }
  if (!expectedPayer) {
    console.error("Missing AVM_PAYER_ADDRESS in .env");
    process.exit(1);
  }

  const algorand = AlgorandClient.testNet();
  const payer = algorand.account.fromMnemonic(mnemonic);
  const payerAddress = payer.addr.toString();

  if (payerAddress !== expectedPayer) {
    console.error(
      `AVM_MNEMONIC does not match AVM_PAYER_ADDRESS.\n  derived:  ${payerAddress}\n  expected: ${expectedPayer}`,
    );
    process.exit(1);
  }

  console.log(`Network: Algorand TestNet`);
  console.log(`Payer: ${payerAddress}`);
  console.log(`USDC ASA: ${USDC_TESTNET_ASA_ID}`);

  const alreadyOptedIn = await isOptedIn(algorand, payerAddress);
  if (alreadyOptedIn) {
    console.log("Already opted into USDC. No transaction submitted.");
    console.log("USDC opt-in status: true");
    return;
  }

  console.log("Not opted in — submitting ASA opt-in (0 amount to self)...");

  const results = await algorand.asset.bulkOptIn(payerAddress, [USDC_ASA]);

  for (const result of results) {
    console.log(`Transaction ID: ${result.transactionId}`);
  }

  const optedIn = await isOptedIn(algorand, payerAddress);
  console.log(`USDC opt-in status: ${optedIn}`);

  if (!optedIn) {
    console.error("Opt-in transaction completed but account still not opted in.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
