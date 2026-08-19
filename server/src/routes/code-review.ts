import { Hono } from "hono";
import { generateCodeReview, AIConfigurationError, AIProviderError } from "../services/ai/gemini.js";

export const codeReviewRouter = new Hono();

function publicAIError(error: AIProviderError): string {
  if (/429|too many requests|quota exceeded|rate limit/i.test(error.message)) {
    return "AI provider quota is temporarily exhausted. Please try again later or configure another Gemini API key.";
  }
  return error.message;
}

codeReviewRouter.post("/", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const { code, language } = body;

  if (typeof code !== "string" || code.trim() === "") {
    return c.json({ error: "Missing or empty 'code' field" }, 400);
  }

  if (typeof language !== "string" || language.trim() === "") {
    return c.json({ error: "Missing 'language' field" }, 400);
  }

  try {
    const review = await generateCodeReview(code, language);
    return c.json({
      success: true,
      review
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
