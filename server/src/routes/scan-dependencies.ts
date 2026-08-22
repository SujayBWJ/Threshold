import { Hono } from "hono";
import { scanDependencies, type DependencyScanRequest } from "../services/security/dependency-scan.js";

export const scanDependenciesRouter = new Hono();

scanDependenciesRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const input = body as Partial<DependencyScanRequest>;
  if (typeof input.dependencies !== "object" || input.dependencies === null || Array.isArray(input.dependencies)) {
    return c.json({ error: "Missing 'dependencies' object" }, 400);
  }
  if (!Object.entries(input.dependencies).every(([name, version]) => name.trim() !== "" && typeof version === "string")) {
    return c.json({ error: "Dependencies must map package names to version strings" }, 400);
  }

  return c.json({ success: true, scan: scanDependencies({ dependencies: input.dependencies as Record<string, string>, lockfileVersion: input.lockfileVersion }) });
});