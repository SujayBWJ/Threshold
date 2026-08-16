import { GoogleGenerativeAI } from "@google/generative-ai";

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

export async function generateCodeReview(
  code: string,
  language: string,
): Promise<CodeReviewResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

  if (!apiKey) {
    throw new AIConfigurationError("Missing GEMINI_API_KEY environment variable.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

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
    let text = result.response.text();
    
    // Strip markdown code blocks if present
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      text = match[1];
    }
    
    // Fix trailing garbage (like extra braces) that the model sometimes outputs
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }
    
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.summary !== "string" || typeof parsed.score !== "number" || !Array.isArray(parsed.issues) || !Array.isArray(parsed.suggestions)) {
        throw new Error("Malformed JSON structure (fields missing or wrong types)");
      }
      return parsed as CodeReviewResponse;
    } catch (parseError: any) {
      console.error("JSON Parse Error:", parseError);
      throw new AIProviderError("AI returned malformed JSON: " + parseError.message);
    }
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (err instanceof AIConfigurationError) throw err;
    throw new AIProviderError("AI provider request failed: " + (err as Error).message);
  }
}
