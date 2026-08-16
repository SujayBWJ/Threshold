import { USDC_TESTNET_ASA_ID, ALGORAND_TESTNET_GENESIS_HASH } from "@x402/avm";
import type { Network } from "@x402/core/types";

export const ALGORAND_TESTNET_NETWORK =
  `algorand:${ALGORAND_TESTNET_GENESIS_HASH}` as Network;

export function getBasePaymentRequirement(price: string, avmAddress: string) {
  return {
    scheme: "exact",
    price,
    network: ALGORAND_TESTNET_NETWORK,
    payTo: avmAddress,
    extra: { asset: USDC_TESTNET_ASA_ID },
  };
}
