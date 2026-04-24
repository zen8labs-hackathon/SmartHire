import { createGoogleGenerativeAI } from "@ai-sdk/google";

import { getGlobalLlmModelId } from "@/lib/llm/config";

export const GEMINI_API_KEY_MISSING_MESSAGE =
  "GOOGLE_GENERATIVE_AI_API_KEY is not configured for LLM_PROVIDER=gemini.";

/**
 * Direct Google AI Studio provider (Gemini).
 * Requires `GOOGLE_GENERATIVE_AI_API_KEY`.
 */
export function createGeminiClient() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(GEMINI_API_KEY_MISSING_MESSAGE);
  }
  return createGoogleGenerativeAI({ apiKey });
}

/** Language model handle for globally configured Gemini model id. */
export function getGeminiLanguageModel(modelId = getGlobalLlmModelId()) {
  return createGeminiClient()(modelId);
}
