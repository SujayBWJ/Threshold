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
      id: "code-review",
      name: "AI Code Review",
      description: "AI-powered code review for source code",
      method: "POST",
      endpoint: "/api/code-review",
      price: DEFAULT_X402_PRICE,
      currency: PAYMENT_CURRENCY,
      network: PAYMENT_NETWORK_LABEL,
      category: "developer-tools",
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
      provider: {
        name: "TextFlow AI",
        walletAddress: requireProviderAddress("PROVIDER_SUMMARIZE_ADDRESS"),
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
