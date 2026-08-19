import { Hono } from "hono";
import {
  generateSummary,
  AIConfigurationError,
  AIProviderError,
} from "../services/ai/gemini.js";

export const summarizeRouter = new Hono();

function publicAIError(error: AIProviderError): string {
  if (/429|too many requests|quota exceeded|rate limit/i.test(error.message)) {
    return "AI provider quota is temporarily exhausted. Please try again later or configure another Gemini API key.";
  }
  return error.message;
}

summarizeRouter.post("/", async (c) => {
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
    const summary = await generateSummary(text);
    return c.json({
      success: true,
      summary,
    });
  } catch (err) {
    if (err instanceof AIConfigurationError) {
      return c.json({ error: "Configuration Error: " + err.message }, 500);
    }
    if (err instanceof AIProviderError) {
      return c.json({ error: "AI Provider Error: " + publicAIError(err) }, 502);
    }
    return c.json({ error: "Internal Server Error" }, 500);
  }
});
