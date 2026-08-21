import {
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
} from "@x402/avm";
import type { Network } from "@x402/core/types";

export const ALGORAND_MAINNET_NETWORK =
  `algorand:${ALGORAND_MAINNET_GENESIS_HASH}` as Network;
export const ALGORAND_TESTNET_NETWORK =
  `algorand:${ALGORAND_TESTNET_GENESIS_HASH}` as Network;

export const DEFAULT_X402_PRICE = "$0.001";
export const PAYMENT_CURRENCY = "USDC";
export function isTestnet(): boolean {
  return process.env.X402_NETWORK?.trim().toLowerCase() === "testnet";
}

export const PAYMENT_NETWORK_LABEL = isTestnet() ? "Algorand TestNet" : "Algorand MainNet";
export const PAYMENT_NETWORK = isTestnet() ? ALGORAND_TESTNET_NETWORK : ALGORAND_MAINNET_NETWORK;
export const PAYMENT_ASSET = isTestnet() ? USDC_TESTNET_ASA_ID : USDC_MAINNET_ASA_ID;

export function getPaymentPrice(): string {
  return process.env.X402_PRICE?.trim() || DEFAULT_X402_PRICE;
}

export function getBasePaymentRequirement(price: string, payToAddress: string) {
  return {
    scheme: "exact" as const,
    price,
    network: PAYMENT_NETWORK,
    payTo: payToAddress,
    extra: { asset: PAYMENT_ASSET },
  };
}
