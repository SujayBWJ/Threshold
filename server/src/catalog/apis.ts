import {
  DEFAULT_X402_PRICE,
  PAYMENT_CURRENCY,
  PAYMENT_NETWORK_LABEL,
} from "../config/payment.js";

export interface ApiProvider {
  name: string;
  walletAddress: string;
}

export interface ApiCatalogEntry {
  id: string;
  name: string;
  description: string;
  method: string;
  endpoint: string;
  price: string;
  currency: string;
  network: string;
  category: string;
  capabilities: string[];
  provider: ApiProvider;
}

function requireProviderAddress(envVar: string): string {
  const value = process.env[envVar]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
  return value;
}

export function getApiCatalog(): ApiCatalogEntry[] {
  return [
    {
      id: "resolve-incident",
      name: "Incident Resolution",
      description: "Structured debugging and patch generation for autonomous agents",
      method: "POST",
      endpoint: "/api/resolve-incident",
      price: DEFAULT_X402_PRICE,
      currency: PAYMENT_CURRENCY,
      network: PAYMENT_NETWORK_LABEL,
      category: "agent-infrastructure",
      capabilities: ["bug-resolution", "patch-generation", "incident-debugging"],
      provider: {
        name: "Threshold Debug Labs",
        walletAddress: requireProviderAddress("PROVIDER_CODE_REVIEW_ADDRESS"),
      },
    },
    {
      id: "code-review",
      name: "AI Code Review",
      description: "AI-powered code review for source code",
      method: "POST",
      endpoint: "/api/code-review",
      price: DEFAULT_X402_PRICE,
      currency: PAYMENT_CURRENCY,
      network: PAYMENT_NETWORK_LABEL,
      category: "developer-tools",
      capabilities: ["code-review", "bug-detection", "security-analysis"],
      provider: {
        name: "DevTools Inc",
        walletAddress: requireProviderAddress("PROVIDER_CODE_REVIEW_ADDRESS"),
      },
    },
    {
      id: "summarize",
      name: "AI Text Summarizer",
      description: "AI-powered summarization of long text",
      method: "POST",
      endpoint: "/api/summarize",
      price: DEFAULT_X402_PRICE,
      currency: PAYMENT_CURRENCY,
      network: PAYMENT_NETWORK_LABEL,
      category: "text-processing",
      capabilities: ["text-summarization", "summarization", "text-processing"],
      provider: {
        name: "TextFlow AI",
        walletAddress: requireProviderAddress("PROVIDER_SUMMARIZE_ADDRESS"),
      },
    },
    {
      id: "dependency-vulnerability-scan",
      name: "Dependency Vulnerability Scan",
      description: "Checks pinned dependencies against a current security feed",
      method: "POST",
      endpoint: "/api/scan-dependencies",
      price: "$0.002",
      currency: PAYMENT_CURRENCY,
      network: PAYMENT_NETWORK_LABEL,
      category: "security-intelligence",
      capabilities: ["dependency-vulnerability-scan", "security-intelligence", "cve-lookup"],
      provider: {
        name: "Threshold Security Feed",
        walletAddress: process.env.PROVIDER_SECURITY_SCAN_ADDRESS?.trim() || requireProviderAddress("PROVIDER_CODE_REVIEW_ADDRESS"),
      },
    },
  ];
}

export function getProviderAddressForApi(apiId: string): string {
  const entry = getApiCatalog().find((api) => api.id === apiId);
  if (!entry) {
    throw new Error(`Unknown API id: ${apiId}`);
  }
  return entry.provider.walletAddress;
}
