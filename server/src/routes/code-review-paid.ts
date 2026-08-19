import { Hono } from "hono";
import { reviewWithPayment } from "../services/payment/code-review.js";

export const codeReviewPaidRouter = new Hono();

codeReviewPaidRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { code, language } = body as { code?: unknown; language?: unknown };
  if (typeof code !== "string" || code.trim() === "") {
    return c.json({ error: "Missing or empty 'code' field" }, 400);
  }
  if (typeof language !== "string" || language.trim() === "") {
    return c.json({ error: "Missing 'language' field" }, 400);
  }

  try {
    const result = await reviewWithPayment(code.trim(), language.trim());
    return c.json({
      ...(result.data as Record<string, unknown>),
      payment: {
        settled: true,
        transaction:
          result.settlement?.transaction ?? result.settlement?.txHash ?? null,
        payer: result.settlement?.payer ?? null,
        network: result.settlement?.network ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Paid request failed";
    console.error("Paid code review request failed:", message);
    return c.json({ error: message }, 502);
  }
});
