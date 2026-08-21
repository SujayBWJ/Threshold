import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { randomBytes } from "node:crypto";
import {
  toClientAvmSigner,
  ExactAvmScheme,
  ALGORAND_MAINNET_CAIP2,
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_CAIP2,
  ALGORAND_TESTNET_GENESIS_HASH,
} from "@x402/avm";
import {
  ed25519SigningKeyFromWrappedSecret,
  type WrappedEd25519Seed,
} from "@algorandfoundation/algokit-utils/crypto";
import { mnemonicFromSeed, seedFromMnemonic } from "@algorandfoundation/algokit-utils/algo25";
import type { Network } from "@x402/core/types";
import { getApiCatalog, type ApiCatalogEntry } from "../../catalog/apis.js";

export type IncidentFlowEvent = {
  type: "step" | "error" | "complete";
  actor: string;
  title: string;
  detail: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

type Settlement = {
  success?: boolean;
  transaction?: string;
  txHash?: string;
  payer?: string;
  network?: string;
  [key: string]: unknown;
};

const fixture = {
  runtime: "node 22",
  language: "typescript",
  error: {
    name: "AssertionError",
    message: "Expected 5 but received 20",
    stack: "at divide.test.ts:8:3",
  },
  files: [
    { path: "src/math.ts", content: "export function divide(a: number, b: number) { return a * b; }" },
    { path: "src/math.test.ts", content: "import { divide } from './math';\nexpect(divide(10, 2)).toBe(5);" },
  ],
  constraints: { must_return_patch: true, run_tests: true, max_files_changed: 1 },
};

function now() {
  return new Date().toISOString();
}

function networkConfig(useTestnet: boolean) {
  return useTestnet
    ? {
        caip: ALGORAND_TESTNET_CAIP2 as Network,
        genesis: `algorand:${ALGORAND_TESTNET_GENESIS_HASH}` as Network,
        label: "Algorand TestNet",
      }
    : {
        caip: ALGORAND_MAINNET_CAIP2 as Network,
        genesis: `algorand:${ALGORAND_MAINNET_GENESIS_HASH}` as Network,
        label: "Algorand MainNet",
      };
}

async function signerFromMnemonic(mnemonic: string) {
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
  return toClientAvmSigner(secretKey);
}

function selectedCapability(catalog: ApiCatalogEntry[]) {
  const selected = catalog.find((entry) => entry.capabilities.includes("bug-resolution"));
  if (!selected) throw new Error("Catalog has no bug-resolution capability");
  return selected;
}

function settlementFrom(response: Response, client: x402Client): Settlement | null {
  try {
    const value = new x402HTTPClient(client).getPaymentSettleResponse(
      (name) => response.headers.get(name),
    );
    return value && typeof value === "object" ? (value as Settlement) : null;
  } catch {
    return null;
  }
}

function decodePaymentRequired(header: string | null): Record<string, unknown> | null {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function explorerUrl(transaction: string, useTestnet: boolean): string {
  const networkPath = useTestnet ? "testnet" : "mainnet";
  return `https://lora.algokit.io/${networkPath}/transaction/${encodeURIComponent(transaction)}`;
}

export async function runIncidentPaymentFlow(options: {
  useTestnet?: boolean;
  emptyWallet?: boolean;
  emit: (event: IncidentFlowEvent) => void;
}): Promise<void> {
  const emit = (event: Omit<IncidentFlowEvent, "timestamp">) =>
    options.emit({ ...event, timestamp: now() });
  const requestedTestnet = options.useTestnet ?? process.env.X402_NETWORK === "testnet";
  const baseUrl = `http://localhost:${process.env.PORT?.trim() || "4021"}`;

  try {
    emit({ type: "step", actor: "AGENT A", title: "Incident detected", detail: `${fixture.error.name}: ${fixture.error.message}`, data: { fixture } });

    const catalogResponse = await fetch(`${baseUrl}/api/catalog`);
    if (!catalogResponse.ok) throw new Error(`Catalog request failed (${catalogResponse.status})`);
    const catalogBody = (await catalogResponse.json()) as { apis?: ApiCatalogEntry[] };
    const catalog = catalogBody.apis ?? [];
    const selected = selectedCapability(catalog);
    const alternatives = catalog.filter((entry) => entry.id !== selected.id).map((entry) => entry.id);
    emit({ type: "step", actor: "AGENT A -> CATALOG", title: "Capability selected", detail: `GET /api/catalog -> ${selected.id} matches bug-resolution; alternatives rejected: ${alternatives.join(", ")}`, data: { selected, alternatives, selectionReason: "The incident requires debugging and patch generation, not code review or summarization." } });

    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fixture),
    };
    const endpoint = `${baseUrl}${selected.endpoint}`;
    const unpaid = await fetch(endpoint, request);
    if (unpaid.status !== 402) throw new Error(`Expected HTTP 402, received ${unpaid.status}`);
    const paymentRequired = unpaid.headers.get("payment-required");
    const paymentTerms = decodePaymentRequired(paymentRequired);
    const accept = Array.isArray(paymentTerms?.accepts) ? paymentTerms.accepts[0] as Record<string, unknown> : undefined;
    const advertisedNetwork = typeof accept?.network === "string" ? accept.network : undefined;
    const useTestnet = advertisedNetwork?.includes(ALGORAND_TESTNET_GENESIS_HASH) ?? requestedTestnet;
    const network = networkConfig(useTestnet);
    const networkNotice = requestedTestnet === useTestnet ? "" : `; using ${network.label} advertised by the 402 requirement`;
    emit({ type: "step", actor: "THRESHOLD GATEWAY", title: "Payment required", detail: `HTTP 402 from ${selected.endpoint}${networkNotice}`, data: { status: unpaid.status, paymentRequired, paymentTerms, amount: accept?.amount, asset: accept?.asset, provider: accept?.payTo, network: accept?.network, networkLabel: network.label } });

    const mnemonic = options.emptyWallet
      ? mnemonicFromSeed(randomBytes(32))
      : process.env.AVM_MNEMONIC?.trim();
    if (!mnemonic) throw new Error("Missing AVM_MNEMONIC in .env");
    const signer = await signerFromMnemonic(mnemonic);
    const expectedPayer = process.env.AVM_PAYER_ADDRESS?.trim();
    if (!options.emptyWallet && expectedPayer && expectedPayer !== signer.address) {
      throw new Error(`AVM_MNEMONIC does not match AVM_PAYER_ADDRESS (${expectedPayer})`);
    }
    emit({ type: "step", actor: "AGENT A / BURNER WALLET", title: "Wallet loaded", detail: `Signer loaded on ${network.label}`, data: { payer: signer.address, network: network.label } });

    const client = new x402Client();
    const scheme = new ExactAvmScheme(signer);
    client.register(network.caip, scheme);
    client.register(network.genesis, scheme);
    client.register("algorand:*" as Network, scheme);
    emit({ type: "step", actor: "AGENT A / X402 CLIENT", title: "Payment signing requested", detail: `ExactAvmScheme registered for ${network.label}; x402 payment signing begins on the paid retry`, data: { network: network.genesis } });

    const response = await wrapFetchWithPayment(fetch, client)(endpoint, request);
    const settlement = settlementFrom(response, client);
    const responseBody = await response.clone().text();
    emit({ type: "step", actor: "ALGORAND FACILITATOR", title: response.ok ? "Settlement response received" : "Payment response received", detail: response.ok ? "GoPlausible facilitator verified and settled the payment" : `GoPlausible facilitator rejected the paid retry with HTTP ${response.status}`, data: { settlement, status: response.status, facilitator: process.env.FACILITATOR_URL, body: responseBody.slice(0, 1000), paymentResponseHeader: response.headers.get("payment-response") || response.headers.get("x-payment-response") } });
    if (!response.ok) throw new Error(`Paid request failed with HTTP ${response.status}: ${responseBody.slice(0, 500)}`);

    const result = await response.json();
    const transaction = settlement?.transaction ?? settlement?.txHash ?? null;
    emit({ type: "step", actor: "AGENT A -> AGENT B", title: "Paid retry accepted", detail: `POST ${selected.endpoint} returned HTTP ${response.status}`, data: { response: result, settlement, transaction, explorerUrl: transaction ? explorerUrl(transaction, useTestnet) : null, provider: selected.provider.walletAddress, network: settlement?.network || network.label } });
    emit({ type: "complete", actor: "AGENT B / DEBUG LABS", title: "Structured patch returned", detail: "The paid capability returned the live incident-resolution response", data: { response: result, settlement, transaction, network: network.label, provider: selected.provider.walletAddress } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit({ type: "error", actor: "THRESHOLD FLOW", title: "Payment flow failed", detail: message, data: { error: message } });
  }
}

export { fixture };
