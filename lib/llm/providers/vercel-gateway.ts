import { createOpenAI } from "@ai-sdk/openai";

import {
  getGlobalLlmModelId,
  getVercelAiGatewayBaseUrl,
} from "@/lib/llm/config";

/**
 * OpenAI-compatible client pointed at Vercel AI Gateway.
 * Requires `AI_GATEWAY_API_KEY`.
 */
export function createVercelGatewayOpenAIClient() {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY is not configured.");
  }
  return createOpenAI({
    apiKey,
    baseURL: getVercelAiGatewayBaseUrl(),
  });
}

/** Language model handle for the globally configured gateway model id. */
export function getVercelGatewayLanguageModel(modelId = getGlobalLlmModelId()) {
  return createVercelGatewayOpenAIClient()(modelId);
}
