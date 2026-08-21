import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export class AIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderError";
  }
}

function getGeminiModel(responseMimeType?: string): GenerativeModel {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

  if (!apiKey) {
    throw new AIConfigurationError("Missing GEMINI_API_KEY environment variable.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: responseMimeType
      ? { responseMimeType }
      : undefined,
  });
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    text = fenced[1];
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    text = jsonMatch[0];
  }

  return text;
}

function getProviderErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/429|too many requests|quota exceeded|rate limit/i.test(message)) {
    return "AI provider quota is temporarily exhausted. Please try again later or configure another Gemini API key.";
  }
  return "AI provider request failed: " + message;
}

export interface CodeReviewResponse {
  summary: string;
  score: number;
  issues: Array<{
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
  }>;
  suggestions: string[];
}

export interface IncidentResolutionResponse {
  diagnosis: string;
  confidence: number;
  patch: Array<{ path: string; diff: string }>;
  verification: { command: string; expected: string };
}

export async function generateIncidentResolution(input: {
  runtime: string;
  language: string;
  error: unknown;
  files: unknown[];
  constraints: unknown;
}): Promise<IncidentResolutionResponse> {
  const model = getGeminiModel("application/json");
  const prompt = `You are a production debugging specialist for an autonomous coding agent.
Diagnose the incident and return only JSON matching this schema:
{
  "diagnosis": "specific root cause",
  "confidence": 0.0,
  "patch": [{ "path": "relative/file.ts", "diff": "unified diff" }],
  "verification": { "command": "test command", "expected": "what passing means" }
}
The patch must be minimal, use relative paths, and be directly applicable by an agent.
Runtime: ${input.runtime}
Language: ${input.language}
Error: ${JSON.stringify(input.error)}
Files: ${JSON.stringify(input.files)}
Constraints: ${JSON.stringify(input.constraints ?? {})}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(extractJsonObject(result.response.text())) as IncidentResolutionResponse;
    if (
      typeof parsed.diagnosis !== "string" ||
      typeof parsed.confidence !== "number" ||
      !Array.isArray(parsed.patch) ||
      typeof parsed.verification?.command !== "string"
    ) {
      throw new Error("Malformed incident resolution response");
    }
    return parsed;
  } catch (err) {
    if (err instanceof AIConfigurationError || err instanceof AIProviderError) throw err;
    throw new AIProviderError(getProviderErrorMessage(err));
  }
}

export async function generateCodeReview(
  code: string,
  language: string,
): Promise<CodeReviewResponse> {
  const model = getGeminiModel("application/json");

  const prompt = `You are an expert code reviewer. Review the following ${language} code.
Analyze for correctness, bugs, security issues, performance, and maintainability.
Provide concrete improvements.

Return ONLY a JSON object matching this exact schema:
{
  "summary": "High level summary",
  "score": <number between 0 and 10>,
  "issues": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "title": "Issue title",
      "description": "Detailed description of the issue"
    }
  ],
  "suggestions": ["Concrete suggestion 1", "Concrete suggestion 2"]
}

Code to review:
\`\`\`${language}
${code}
\`\`\`
`;

  try {
    const result = await model.generateContent(prompt);
    const text = extractJsonObject(result.response.text());

    try {
      const parsed = JSON.parse(text);
      if (
        typeof parsed.summary !== "string" ||
        typeof parsed.score !== "number" ||
        !Array.isArray(parsed.issues) ||
        !Array.isArray(parsed.suggestions)
      ) {
        throw new Error("Malformed JSON structure (fields missing or wrong types)");
      }
      return parsed as CodeReviewResponse;
    } catch (parseError: unknown) {
      const message =
        parseError instanceof Error ? parseError.message : String(parseError);
      console.error("JSON Parse Error:", parseError);
      throw new AIProviderError("AI returned malformed JSON: " + message);
    }
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (err instanceof AIConfigurationError) throw err;
    throw new AIProviderError(getProviderErrorMessage(err));
  }
}

export async function generateSummary(text: string): Promise<string> {
  const model = getGeminiModel("application/json");

  const prompt = `You are an expert text summarizer. Summarize the following text concisely while preserving the key points.

Return ONLY a JSON object matching this exact schema:
{
  "summary": "A clear, concise summary of the text"
}

Text to summarize:
${text}
`;

  try {
    const result = await model.generateContent(prompt);
    const raw = extractJsonObject(result.response.text());

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.summary !== "string" || parsed.summary.trim() === "") {
        throw new Error("Malformed JSON structure (summary missing or empty)");
      }
      return parsed.summary;
    } catch (parseError: unknown) {
      const message =
        parseError instanceof Error ? parseError.message : String(parseError);
      console.error("JSON Parse Error:", parseError);
      throw new AIProviderError("AI returned malformed JSON: " + message);
    }
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (err instanceof AIConfigurationError) throw err;
    throw new AIProviderError(getProviderErrorMessage(err));
  }
}
