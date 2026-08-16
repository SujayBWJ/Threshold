/**
 * Funds provider TestNet wallets with ALGO.
 * Tries the public TestNet bank dispenser first; falls back to payer transfer.
 * Never prints mnemonics or private keys.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AlgorandClient } from "@algorandfoundation/algokit-utils/algorand-client";
import { microAlgo } from "@algorandfoundation/algokit-utils/amount";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const TESTNET_BANK_URL = "https://bank.testnet.algorand.network/";
const FUND_MICROALGOS = 300_000; // 0.3 ALGO — enough for min balance + opt-in fees
const MIN_MICROALGOS = 200_000n;

const PROVIDER_ADDRESSES = [
  { label: "Provider A (Code Review)", envKey: "PROVIDER_CODE_REVIEW_ADDRESS" },
  { label: "Provider B (Summarize)", envKey: "PROVIDER_SUMMARIZE_ADDRESS" },
] as const;

async function requestDispenserFunds(address: string): Promise<boolean> {
  try {
    const response = await fetch(TESTNET_BANK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, amount: FUND_MICROALGOS }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fundFromAccount(
  algorand: AlgorandClient,
  mnemonic: string,
  receiver: string,
): Promise<string> {
  const sender = algorand.account.fromMnemonic(mnemonic);
  const result = await algorand.send.payment({
    sender: sender.addr,
    receiver,
    amount: microAlgo(FUND_MICROALGOS),
  });
  return result.txIds[0] ?? "unknown";
}

async function main(): Promise<void> {
  const algorand = AlgorandClient.testNet();
  const receiverMnemonic = process.env.AVM_RECEIVER_MNEMONIC?.trim();
  const payerMnemonic = process.env.AVM_MNEMONIC?.trim();

  console.log("=== Fund provider wallets ===\n");

  for (const provider of PROVIDER_ADDRESSES) {
    const address = process.env[provider.envKey]?.trim();
    if (!address) {
      console.error(`Missing ${provider.envKey}. Run generate-provider-accounts.ts first.`);
      process.exit(1);
    }

    const before = await algorand.account.getInformation(address);
    const beforeMicro = BigInt(before.balance.microAlgo);
    console.log(`${provider.label}: ${address}`);
    console.log(`  ALGO before: ${Number(beforeMicro) / 1_000_000}`);

    if (beforeMicro < MIN_MICROALGOS) {
      console.log("  Requesting ALGO from TestNet dispenser...");
      const dispensed = await requestDispenserFunds(address);
      if (dispensed) {
        await new Promise((r) => setTimeout(r, 4000));
      }

      const mid = await algorand.account.getInformation(address);
      if (BigInt(mid.balance.microAlgo) < MIN_MICROALGOS) {
        const fundingMnemonic = receiverMnemonic ?? payerMnemonic;
        if (!fundingMnemonic) {
          console.error("  Dispenser failed and no funding mnemonic available.");
          process.exit(1);
        }
        console.log("  Dispenser unavailable — funding from existing TestNet account...");
        const txId = await fundFromAccount(algorand, fundingMnemonic, address);
        console.log(`  Funding transaction ID: ${txId}`);
        await new Promise((r) => setTimeout(r, 4000));
      }
    } else {
      console.log("  Already funded.");
    }

    const after = await algorand.account.getInformation(address);
    const afterMicro = BigInt(after.balance.microAlgo);
    console.log(`  ALGO after:  ${Number(afterMicro) / 1_000_000}\n`);

    if (afterMicro < 200_000n) {
      console.error(`  NEED: more ALGO for ${provider.label}`);
      process.exit(1);
    }
  }

  console.log("Provider wallets funded.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
