import { Hono } from "hono";
import { runAgent } from "../services/agent/run.js";

export const agentRouter = new Hono();

agentRouter.post("/run", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { task, mode, text, code, language } = body as {
    task?: unknown;
    mode?: unknown;
    text?: unknown;
    code?: unknown;
    language?: unknown;
  };
  if (typeof task !== "string" || task.trim() === "") {
    return c.json({ error: "Missing or empty 'task' field" }, 400);
  }
  if (
    mode !== undefined &&
    mode !== "summarize" &&
    mode !== "code-review" &&
    mode !== "code-review-and-summarize"
  ) {
    return c.json({ error: "Invalid 'mode' field" }, 400);
  }

  try {
    return c.json(await runAgent({
      task: task.trim(),
      mode: mode as
        | "summarize"
        | "code-review"
        | "code-review-and-summarize"
        | undefined,
      text: typeof text === "string" ? text : undefined,
      code: typeof code === "string" ? code : undefined,
      language: typeof language === "string" ? language : undefined,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent request failed";
    console.error("Agent request failed:", message);
    const unsupportedTask = message.startsWith("Unsupported task.");
    return c.json({ error: message }, unsupportedTask ? 422 : 502);
  }
});
