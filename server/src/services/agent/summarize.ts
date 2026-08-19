import { getApiCatalog, type ApiCatalogEntry } from "../../catalog/apis.js";
import { summarizeWithPayment } from "../payment/summarize.js";

export type AgentSummaryResult = {
  success: true;
  intent: "summarize";
  result: { summary: string };
  steps: Array<{
    apiId: string;
    apiName: string;
    provider: string;
    capability: string;
    price: string;
    currency: string;
    status: "paid_and_complete";
    transaction: string | null;
  }>;
  totalCost: string;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
}

function isSummarizationTask(task: string): boolean {
  const normalized = normalize(task);
  return [
    "summarize",
    "summarise",
    "summary",
    "shorten",
    "brief",
    "concise",
    "key points",
  ].some((term) => normalized.includes(term));
}

function selectSummarizer(catalog: ApiCatalogEntry[]): ApiCatalogEntry {
  const api = catalog.find((entry) =>
    entry.capabilities.includes("text-summarization"),
  );
  if (!api) {
    throw new Error("No API matches the text-summarization capability");
  }
  return api;
}

export async function runSummaryAgent(
  task: string,
  text: string,
): Promise<AgentSummaryResult> {
  if (!isSummarizationTask(task)) {
    throw new Error(
      "Unsupported task. Try asking Threshold to summarize or shorten the text.",
    );
  }

  const selectedApi = selectSummarizer(getApiCatalog());
  const paidResult = await summarizeWithPayment(text);
  const data = paidResult.data as { summary?: unknown };
  if (typeof data.summary !== "string") {
    throw new Error("The selected summarizer returned no summary");
  }

  const transaction =
    paidResult.settlement?.transaction ?? paidResult.settlement?.txHash ?? null;

  return {
    success: true,
    intent: "summarize",
    result: { summary: data.summary },
    steps: [
      {
        apiId: selectedApi.id,
        apiName: selectedApi.name,
        provider: selectedApi.provider.name,
        capability: "text-summarization",
        price: selectedApi.price,
        currency: selectedApi.currency,
        status: "paid_and_complete",
        transaction,
      },
    ],
    totalCost: `${selectedApi.price} ${selectedApi.currency}`,
  };
}
