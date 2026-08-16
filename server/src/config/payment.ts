import { USDC_TESTNET_ASA_ID, ALGORAND_TESTNET_GENESIS_HASH } from "@x402/avm";
import type { Network } from "@x402/core/types";

export const ALGORAND_TESTNET_NETWORK =
  `algorand:${ALGORAND_TESTNET_GENESIS_HASH}` as Network;

export const DEFAULT_X402_PRICE = "$0.001";
export const PAYMENT_CURRENCY = "USDC";
export const PAYMENT_NETWORK_LABEL = "Algorand TestNet";

export function getPaymentPrice(): string {
  return process.env.X402_PRICE?.trim() || DEFAULT_X402_PRICE;
}

export function getBasePaymentRequirement(price: string, payToAddress: string) {
  return {
    scheme: "exact" as const,
    price,
    network: ALGORAND_TESTNET_NETWORK,
    payTo: payToAddress,
    extra: { asset: USDC_TESTNET_ASA_ID },
  };
}
