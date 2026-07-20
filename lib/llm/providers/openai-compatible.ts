import { createOpenAI } from "@ai-sdk/openai";

import {
  getGlobalLlmModelId,
  getOpenAiCompatibleBaseUrl,
} from "@/lib/llm/config";

export const OPENAI_COMPATIBLE_CONFIG_MISSING_MESSAGE =
  "LLM_API_KEY and LLM_BASE_URL are required for LLM_PROVIDER=openai_compatible.";

/**
 * OpenAI-compatible client (LiteLLM, OpenAI, or any `/v1` proxy).
 * Requires `LLM_API_KEY` and `LLM_BASE_URL`.
 */
export function createOpenAiCompatibleClient() {
  const apiKey = process.env.LLM_API_KEY?.trim();
  const baseURL = getOpenAiCompatibleBaseUrl();
  if (!apiKey || !baseURL) {
    throw new Error(OPENAI_COMPATIBLE_CONFIG_MISSING_MESSAGE);
  }
  return createOpenAI({
    apiKey,
    baseURL,
  });
}

/** Language model handle for the globally configured OpenAI-compatible model id. */
export function getOpenAiCompatibleLanguageModel(
  modelId = getGlobalLlmModelId(),
) {
  return createOpenAiCompatibleClient()(modelId);
}
