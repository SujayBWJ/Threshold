import { x402Client, wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
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
import { thresholdTool } from "../agent/tools.js";

const execFileAsync = promisify(execFile);

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

export type IncidentBugId = "divide" | "regional-cache" | "dependency-scan";

export const incidentFixtures: Record<IncidentBugId, {
  id: IncidentBugId;
  label: string;
  runtime: string;
  language: string;
  error: { name: string; message: string; stack: string };
  files: Array<{ path: string; content: string }>;
  dependencies?: Record<string, string>;
  manifestPath?: string;
  constraints: Record<string, unknown>;
}> = {
  divide: {
    id: "divide",
    label: "Divide bug",
    runtime: "node 22 / vitest",
    language: "typescript",
    error: { name: "AssertionError", message: "Expected 5 but received 20", stack: "at math.test.ts:4:22" },
    files: [
      { path: "src/math.ts", content: "export function divide(a: number, b: number): number {\n  return a * b;\n}" },
      { path: "src/math.test.ts", content: "import { divide } from './math';\n\ntest('divides two numbers', () => {\n  expect(divide(10, 2)).toBe(5);\n});" },
    ],
    constraints: { must_return_patch: true, run_tests: true, max_files_changed: 1 },
  },
  "regional-cache": {
    id: "regional-cache",
    label: "Regional cache bug",
    runtime: "node 22 / vitest",
    language: "typescript",
    error: { name: "RegionCacheIsolationError", message: "Expected eu-west profile, received us-east profile after cache hit", stack: "at userLookup.test.ts:10:29" },
    files: [
      { path: "src/cache/userLookup.ts", content: "type User = { id: string; region: string; name: string };\nconst cache = new Map<string, User>();\n\nexport async function findUser(userId: string, region: string, load: () => Promise<User>) {\n  const key = userId;\n  const cached = cache.get(key);\n  if (cached) return cached;\n  const user = await load();\n  cache.set(key, user);\n  return user;\n}" },
      { path: "src/cache/userLookup.test.ts", content: "import { findUser } from './userLookup';\n\ntest('does not share users between regions', async () => {\n  const us = await findUser('user-42', 'us-east', async () => ({ id: 'user-42', region: 'us-east', name: 'US user' }));\n  const eu = await findUser('user-42', 'eu-west', async () => ({ id: 'user-42', region: 'eu-west', name: 'EU user' }));\n  expect(us.region).toBe('us-east');\n  expect(eu.region).toBe('eu-west');\n});" },
    ],
    constraints: { must_return_patch: true, run_tests: true, max_files_changed: 1, security_sensitive: true },
  },
  "dependency-scan": {
    id: "dependency-scan",
    label: "Dependency vulnerability scan",
    runtime: "node 22 / security-feed-client",
    language: "json",
    error: { name: "DependencySecurityCheckRequired", message: "All tests pass, but dependency freshness is unknown", stack: "at package.json:1:1" },
    files: [
      { path: "package.json", content: "{\n  \"dependencies\": {\n    \"demo-xml-parser\": \"1.4.0\"\n  }\n}" },
      { path: "README.md", content: "# Fixture project\n\nRuntime behavior is covered by passing tests.\n" },
    ],
    dependencies: { "demo-xml-parser": "1.4.0" },
    manifestPath: "fixtures/dependency-scan/package.json",
    constraints: { must_return_scan: true, query_external_security_feed: true, return_recommended_version: true },
  },
};

const fixture = incidentFixtures.divide;

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

function selectedCapability(catalog: ApiCatalogEntry[], bugId: IncidentBugId) {
  const capability = bugId === "dependency-scan" ? "dependency-vulnerability-scan" : "bug-resolution";
  const selected = catalog.find((entry) => entry.capabilities.includes(capability));
  if (!selected) throw new Error(`Catalog has no ${capability} capability`);
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

function patchText(diff: unknown, path: string): string {
  if (typeof diff !== "string") throw new Error("Provider returned a patch without diff text");
  const text = diff.replace(/^```(?:diff|patch)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (text.startsWith("@@")) {
    return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${text}\n`;
  }
  return `${text}\n`;
}

export async function verifyResolution(selectedFixture: typeof fixture, resolution: { patch?: Array<{ path?: string; diff?: string }> }) {
  const workspace = await mkdtemp(join(tmpdir(), "threshold-incident-"));
  try {
    for (const file of selectedFixture.files) {
      const target = resolve(workspace, file.path);
      if (!target.startsWith(resolve(workspace) + "\\") && !target.startsWith(resolve(workspace) + "/")) {
        throw new Error(`Fixture path escapes verification workspace: ${file.path}`);
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
    await execFileAsync("git", ["init", "--quiet"], { cwd: workspace });
    const patch = (resolution.patch ?? []).map((entry) => {
      if (!selectedFixture.files.some((file) => file.path === entry.path)) {
        throw new Error(`Provider patch targets unexpected file: ${entry.path || "unknown"}`);
      }
      return patchText(entry.diff, entry.path as string);
    }).join("\n");
    const patchPath = join(workspace, ".threshold-provider.patch");
    await writeFile(patchPath, patch, "utf8");
    await execFileAsync("git", ["apply", "--check", "--recount", "--inaccurate-eof", "--whitespace=nowarn", patchPath], { cwd: workspace });
    await execFileAsync("git", ["apply", "--recount", "--inaccurate-eof", "--whitespace=nowarn", patchPath], { cwd: workspace });
    const testFile = selectedFixture.files.find((file) => file.path.endsWith(".test.ts"));
    if (!testFile) throw new Error("Fixture has no test file to verify");
    const testPath = resolve(workspace, testFile.path);
    try {
      if (process.platform === "win32") {
        await execFileAsync("cmd.exe", ["/d", "/c", `pnpm exec tsx --test ${testPath}`], { cwd: process.cwd() });
      } else {
        await execFileAsync("pnpm", ["exec", "tsx", "--test", testPath], { cwd: process.cwd() });
      }
    } catch (error) {
      const commandError = error as { stderr?: string; stdout?: string; message?: string };
      throw new Error([commandError.message, commandError.stderr, commandError.stdout].filter(Boolean).join("\n").trim());
    }
    const changed = await Promise.all((resolution.patch ?? []).map(async (entry) => ({
      path: entry.path,
      content: await readFile(resolve(workspace, entry.path as string), "utf8"),
    })));
    return { command: `pnpm exec tsx --test ${testFile.path}`, changed };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function loadDependencyManifest(manifestPath: string): Promise<Record<string, string>> {
  const manifest = JSON.parse(await readFile(resolve(process.cwd(), manifestPath), "utf8")) as { dependencies?: Record<string, string> };
  return manifest.dependencies ?? {};
}

export function explorerUrl(transaction: string, useTestnet: boolean): string {
  const networkPath = useTestnet ? "testnet" : "mainnet";
  return `https://lora.algokit.io/${networkPath}/transaction/${encodeURIComponent(transaction)}`;
}

export async function runIncidentPaymentFlow(options: {
  useTestnet?: boolean;
  emptyWallet?: boolean;
  bugId?: IncidentBugId;
  emit: (event: IncidentFlowEvent) => void;
}): Promise<void> {
  const emit = (event: Omit<IncidentFlowEvent, "timestamp">) =>
    options.emit({ ...event, timestamp: now() });
  const requestedTestnet = options.useTestnet ?? process.env.X402_NETWORK === "testnet";
  const baseUrl = `http://localhost:${process.env.PORT?.trim() || "4021"}`;
  let payerAddress: string | undefined;
  let paymentNetwork = requestedTestnet ? "Algorand TestNet" : "Algorand MainNet";
  let paymentAsset: string | undefined;
  let paymentAmount: string | undefined;
  const selectedFixture = incidentFixtures[options.bugId ?? "divide"];
  const requestBody = selectedFixture.id === "dependency-scan"
    ? { dependencies: selectedFixture.dependencies, lockfileVersion: 3 }
    : selectedFixture;
  let verificationStarted = false;

  try {
    if (selectedFixture.id === "dependency-scan" && selectedFixture.manifestPath) {
      requestBody.dependencies = await loadDependencyManifest(selectedFixture.manifestPath);
    }
    emit({ type: "step", actor: "AGENT A", title: "Incident detected", detail: `${selectedFixture.error.name}: ${selectedFixture.error.message}`, data: { fixture: selectedFixture, requestBody } });
    emit({ type: "step", actor: "AGENT A / TOOL REGISTRY", title: "Threshold tool available", detail: `${thresholdTool.name}: ${thresholdTool.description}`, data: { tool: thresholdTool } });

    const catalogResponse = await fetch(`${baseUrl}/api/catalog`);
    if (!catalogResponse.ok) throw new Error(`Catalog request failed (${catalogResponse.status})`);
    const catalogBody = (await catalogResponse.json()) as { apis?: ApiCatalogEntry[] };
    const catalog = catalogBody.apis ?? [];
    const selected = selectedCapability(catalog, selectedFixture.id);
    const alternatives = catalog.filter((entry) => entry.id !== selected.id).map((entry) => entry.id);
    const selectionReason = selectedFixture.id === "dependency-scan"
      ? "The project has no failing logic test; current vulnerability intelligence requires a security-feed lookup."
      : "The incident requires debugging and patch generation, not code review, summarization, or dependency intelligence.";
    emit({ type: "step", actor: "AGENT A -> CATALOG", title: "Capability selected", detail: `GET /api/catalog -> ${selected.id} matches ${selectedFixture.id === "dependency-scan" ? "dependency-vulnerability-scan" : "bug-resolution"}; alternatives rejected: ${alternatives.join(", ")}`, data: { selected, alternatives, selectionReason } });

    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
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
    paymentNetwork = network.label;
    paymentAsset = typeof accept?.asset === "string" ? accept.asset : undefined;
    paymentAmount = typeof accept?.amount === "string" ? accept.amount : undefined;
    const networkNotice = requestedTestnet === useTestnet ? "" : `; using ${network.label} advertised by the 402 requirement`;
    emit({ type: "step", actor: "THRESHOLD GATEWAY", title: "Payment required", detail: `HTTP 402 from ${selected.endpoint}${networkNotice}`, data: { status: unpaid.status, paymentRequired, paymentTerms, amount: accept?.amount, asset: accept?.asset, provider: accept?.payTo, network: accept?.network, networkLabel: network.label } });

    const mnemonic = options.emptyWallet
      ? mnemonicFromSeed(randomBytes(32))
      : process.env.AVM_MNEMONIC?.trim();
    if (!mnemonic) throw new Error("Missing AVM_MNEMONIC in .env");
    const signer = await signerFromMnemonic(mnemonic);
    payerAddress = signer.address;
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

    const result = await response.json() as {
      resolution?: { patch?: Array<{ path?: string; diff?: string }> };
      scan?: { findings?: Array<{ package?: string; vulnerability?: string; recommendedVersion?: string }>; clean?: boolean; generatedAt?: string };
    };
    const transaction = settlement?.transaction ?? settlement?.txHash ?? null;
    emit({ type: "step", actor: "AGENT A -> AGENT B", title: "Paid retry accepted", detail: `POST ${selected.endpoint} returned HTTP ${response.status}`, data: { response: result, settlement, transaction, explorerUrl: transaction ? explorerUrl(transaction, useTestnet) : null, provider: selected.provider.walletAddress, network: settlement?.network || network.label } });
    if (selectedFixture.id === "dependency-scan") {
      emit({ type: "step", actor: "AGENT A / SECURITY VERIFIER", title: "Dependency scan completed", detail: `${result.scan?.findings?.length ?? 0} vulnerability finding(s) returned from the OSV-compatible mock security feed`, data: { scan: result.scan, externalLookup: true } });
    } else {
      verificationStarted = true;
      if (!result.resolution) throw new Error("Provider returned no incident resolution");
      const verification = await verifyResolution(selectedFixture, result.resolution);
      const fileEvidence = verification.changed.map((file) => ({
        path: file.path,
        sha256: createHash("sha256").update(file.content, "utf8").digest("hex"),
      }));
      emit({ type: "step", actor: "AGENT A / VERIFIER", title: "Verification passed", detail: `${verification.command} passed after applying the provider patch on disk; verified ${fileEvidence.map((file) => `${file.path} (sha256:${file.sha256.slice(0, 12)}...)`).join(", ")}`, data: { command: verification.command, changed: fileEvidence, patchApplied: true } });
    }
    emit({ type: "complete", actor: "AGENT B / DEBUG LABS", title: selectedFixture.id === "dependency-scan" ? "Security intelligence returned" : "Structured patch returned", detail: "The paid capability returned its live structured response", data: { response: result, settlement, transaction, network: network.label, provider: selected.provider.walletAddress } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const insufficientFunds = Boolean(options.emptyWallet && payerAddress);
    const detail = insufficientFunds
      ? `Insufficient funds: wallet ${payerAddress} cannot settle ${paymentAmount ? `${paymentAmount} micro-USDC` : "the required USDC payment"} on ${paymentNetwork}. Fund the wallet, then run the task again.`
      : message;
    emit({
      type: "error",
      actor: "THRESHOLD FLOW",
      title: insufficientFunds ? "Payment failed: insufficient funds" : verificationStarted ? "Verification failed" : "Payment flow failed",
      detail,
      data: {
        error: message,
        failureReason: insufficientFunds ? "insufficient-funds" : verificationStarted ? "verification-error" : "payment-flow-error",
        payer: payerAddress,
        network: paymentNetwork,
        asset: paymentAsset,
        amount: paymentAmount,
        walletExplorerUrl: payerAddress ? `https://lora.algokit.io/${paymentNetwork.includes("TestNet") ? "testnet" : "mainnet"}/account/${payerAddress}` : null,
        fundingInstructions: insufficientFunds
          ? "Transfer TestNet ALGO for transaction fees and TestNet USDC ASA 10458941 to this wallet, then run the task again with the funded wallet option."
          : null,
      },
    });
  }
}

export { fixture };
