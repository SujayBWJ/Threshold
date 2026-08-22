export const thresholdTool = {
  name: "threshold.resolveIncident",
  description: "Discover and pay for a debugging capability that returns a structured patch for a failing test.",
  input: {
    runtime: "string",
    language: "string",
    error: "object",
    files: "array of { path, content }",
    constraints: "object",
  },
} as const;