import { getApiCatalog, type ApiCatalogEntry } from "../../catalog/apis.js";
import { reviewWithPayment } from "../payment/code-review.js";
import { summarizeWithPayment } from "../payment/summarize.js";

export type AgentResult = {
  success: true;
  intent: "summarize" | "code-review" | "code-review-and-summarize";
  result: { summary?: string; review?: unknown };
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

function hasReviewIntent(task: string): boolean {
  const normalized = normalize(task);
  return ["review", "bug", "issue", "security", "code quality"].some((term) =>
    normalized.includes(term),
  );
}

function hasSummaryIntent(task: string): boolean {
  const normalized = normalize(task);
  return ["summarize", "summarise", "summary", "shorten", "brief", "concise", "key points"].some(
    (term) => normalized.includes(term),
  );
}

function selectApi(catalog: ApiCatalogEntry[], capability: string): ApiCatalogEntry {
  const api = catalog.find((entry) => entry.capabilities.includes(capability));
  if (!api) throw new Error(`No API matches the ${capability} capability`);
  return api;
}

function paymentStep(api: ApiCatalogEntry, transaction: string | null, capability: string) {
  return {
    apiId: api.id,
    apiName: api.name,
    provider: api.provider.name,
    capability,
    price: api.price,
    currency: api.currency,
    status: "paid_and_complete" as const,
    transaction,
  };
}

export async function runAgent(input: {
  task: string;
  mode?: "summarize" | "code-review" | "code-review-and-summarize";
  text?: string;
  code?: string;
  language?: string;
}): Promise<AgentResult> {
  const catalog = getApiCatalog();
  const composeRequested = input.mode === "code-review-and-summarize";
  const reviewRequested = composeRequested || input.mode === "code-review" || hasReviewIntent(input.task);
  const summaryRequested = input.mode === "summarize" || hasSummaryIntent(input.task);

  if (reviewRequested) {
    if (!input.code?.trim() || !input.language?.trim()) {
      throw new Error("Code review needs both code and language");
    }
    const api = selectApi(catalog, "code-review");
    const paidResult = await reviewWithPayment(input.code.trim(), input.language.trim());
    const data = paidResult.data as { review?: unknown };
    if (!data.review) throw new Error("The selected code review API returned no review");
    const transaction = paidResult.settlement?.transaction ?? paidResult.settlement?.txHash ?? null;

    if (composeRequested) {
      const summaryApi = selectApi(catalog, "text-summarization");
      const summaryInput = `Code review result:\n${JSON.stringify(data.review)}`;
      const summaryResult = await summarizeWithPayment(summaryInput);
      const summaryData = summaryResult.data as { summary?: unknown };
      if (typeof summaryData.summary !== "string") {
        throw new Error("The selected summarizer returned no summary");
      }
      const summaryTransaction = summaryResult.settlement?.transaction ?? summaryResult.settlement?.txHash ?? null;
      return {
        success: true,
        intent: "code-review-and-summarize",
        result: { summary: summaryData.summary, review: data.review },
        steps: [
          paymentStep(api, transaction, "code-review"),
          paymentStep(summaryApi, summaryTransaction, "text-summarization"),
        ],
        totalCost: "$0.002 USDC",
      };
    }

    return {
      success: true,
      intent: "code-review",
      result: { review: data.review },
      steps: [paymentStep(api, transaction, "code-review")],
      totalCost: `${api.price} ${api.currency}`,
    };
  }

  if (!summaryRequested) {
    throw new Error("Unsupported task. Choose summarize or code review, or describe one in your task.");
  }
  if (!input.text?.trim()) throw new Error("Summarization needs text to process");

  const api = selectApi(catalog, "text-summarization");
  const paidResult = await summarizeWithPayment(input.text.trim());
  const data = paidResult.data as { summary?: unknown };
  if (typeof data.summary !== "string") throw new Error("The selected summarizer returned no summary");
  const transaction = paidResult.settlement?.transaction ?? paidResult.settlement?.txHash ?? null;
  return {
    success: true,
    intent: "summarize",
    result: { summary: data.summary },
    steps: [paymentStep(api, transaction, "text-summarization")],
    totalCost: `${api.price} ${api.currency}`,
  };
}
