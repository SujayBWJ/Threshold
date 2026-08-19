import { Hono } from "hono";
import { summarizeWithPayment } from "../services/payment/summarize.js";

export const summarizePaidRouter = new Hono();

summarizePaidRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { text } = body as { text?: unknown };
  if (typeof text !== "string" || text.trim() === "") {
    return c.json({ error: "Missing or empty 'text' field" }, 400);
  }

  try {
    const result = await summarizeWithPayment(text.trim());
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
    console.error("Paid summarizer request failed:", message);
    return c.json({ error: message }, 502);
  }
});
