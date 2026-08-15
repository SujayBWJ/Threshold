/**
 * Checks TestNet ALGO balance + USDC ASA opt-in/balance for payer and receiver.
 * Never prints secrets.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AlgorandClient } from "@algorandfoundation/algokit-utils/algorand-client";
import { USDC_TESTNET_ASA_ID } from "@x402/avm";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

type AccountStatus = {
  label: string;
  address: string;
  exists: boolean;
  algoMicro: bigint;
  usdcOptedIn: boolean;
  usdcRaw: bigint;
};

async function inspect(label: string, address: string): Promise<AccountStatus> {
  const algorand = AlgorandClient.testNet();
  try {
    const info = await algorand.account.getInformation(address);
    const algoMicro = BigInt(info.balance.microAlgo);
    const holding = info.assets?.find(
      (a) => String(a.assetId) === USDC_TESTNET_ASA_ID,
    );
    return {
      label,
      address,
      exists: true,
      algoMicro,
      usdcOptedIn: Boolean(holding),
      usdcRaw: BigInt(holding?.amount ?? 0),
    };
  } catch {
    return {
      label,
      address,
      exists: false,
      algoMicro: 0n,
      usdcOptedIn: false,
      usdcRaw: 0n,
    };
  }
}

function microAlgoToAlgo(micro: bigint): string {
  return (Number(micro) / 1_000_000).toFixed(6);
}

function usdcToDecimal(raw: bigint): string {
  return (Number(raw) / 1_000_000).toFixed(6);
}

async function main(): Promise<void> {
  const payer = process.env.AVM_PAYER_ADDRESS?.trim();
  const receiver = process.env.AVM_ADDRESS?.trim();

  if (!payer || !receiver) {
    console.error("Missing AVM_PAYER_ADDRESS or AVM_ADDRESS. Run generate-testnet-accounts first.");
    process.exit(1);
  }

  const statuses = await Promise.all([
    inspect("payer", payer),
    inspect("receiver", receiver),
  ]);

  let ready = true;

  for (const s of statuses) {
    console.log(`\n${s.label}: ${s.address}`);
    if (!s.exists) {
      console.log("  status: account not found on TestNet (unfunded)");
      ready = false;
      continue;
    }
    console.log(`  ALGO: ${microAlgoToAlgo(s.algoMicro)}`);
    console.log(
      `  USDC (ASA ${USDC_TESTNET_ASA_ID}): optedIn=${s.usdcOptedIn} balance=${usdcToDecimal(s.usdcRaw)}`,
    );

    if (s.algoMicro < 200_000n) {
      console.log("  NEED: more TestNet ALGO (fees + min balance)");
      ready = false;
    }
    if (!s.usdcOptedIn) {
      console.log("  NEED: opt-in to TestNet USDC ASA 10458941");
      ready = false;
    }
    if (s.label === "payer" && s.usdcRaw < 1000n) {
      console.log("  NEED: TestNet USDC for payer (at least 0.001 USDC)");
      ready = false;
    }
  }

  console.log("");
  if (ready) {
    console.log("READY: accounts appear funded and opted-in for e2e payment.");
    process.exit(0);
  }

  console.log("NOT READY: complete the funding steps below, then re-run this check.");
  process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
