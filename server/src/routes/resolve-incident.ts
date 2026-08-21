import { Hono } from "hono";
import {
  AIConfigurationError,
  AIProviderError,
  generateIncidentResolution,
} from "../services/ai/gemini.js";

export const resolveIncidentRouter = new Hono();

resolveIncidentRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { runtime, language, error, files, constraints } = body as {
    runtime?: unknown;
    language?: unknown;
    error?: unknown;
    files?: unknown;
    constraints?: unknown;
  };

  if (typeof runtime !== "string" || runtime.trim() === "") {
    return c.json({ error: "Missing 'runtime' field" }, 400);
  }
  if (typeof language !== "string" || language.trim() === "") {
    return c.json({ error: "Missing 'language' field" }, 400);
  }
  if (typeof error !== "object" || error === null) {
    return c.json({ error: "Missing 'error' object" }, 400);
  }
  if (!Array.isArray(files) || files.length === 0) {
    return c.json({ error: "Missing or empty 'files' array" }, 400);
  }

  const validFiles = files.every((file) => {
    if (typeof file !== "object" || file === null) return false;
    const candidate = file as { path?: unknown; content?: unknown };
    return (
      typeof candidate.path === "string" &&
      candidate.path.trim() !== "" &&
      typeof candidate.content === "string"
    );
  });
  if (!validFiles) {
    return c.json({ error: "Each file requires string 'path' and 'content'" }, 400);
  }

  try {
    const resolution = await generateIncidentResolution({
      runtime: runtime.trim(),
      language: language.trim(),
      error,
      files,
      constraints,
    });
    return c.json({ success: true, resolution });
  } catch (err) {
    if (err instanceof AIConfigurationError) {
      return c.json({ error: "Configuration Error: " + err.message }, 500);
    }
    if (err instanceof AIProviderError) {
      return c.json({ error: "AI Provider Error: " + err.message }, 502);
    }
    return c.json({ error: "Internal Server Error" }, 500);
  }
});