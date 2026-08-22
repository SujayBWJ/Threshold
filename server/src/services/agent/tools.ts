export const thresholdTool = {
  name: "threshold.resolveIncident",
  description: "Discover and pay for a debugging or security capability that returns a structured patch or current dependency finding.",
  input: {
    runtime: "string",
    language: "string",
    error: "object",
    files: "array of { path, content }",
    constraints: "object",
  },
} as const;