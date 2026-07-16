export type { LlmProviderId } from "@/lib/llm/types";
export {
  getGlobalLlmModelId,
  getJdExtractModelId,
  getOpenAiCompatibleBaseUrl,
  getVercelAiGatewayBaseUrl,
  isLlmInferenceConfigured,
  llmInferenceDisabledReason,
  parseLlmProviderId,
} from "@/lib/llm/config";
export {
  createGeminiClient,
  GEMINI_API_KEY_MISSING_MESSAGE,
  getGeminiLanguageModel,
} from "@/lib/llm/providers/gemini.stub";
export {
  createOpenAiCompatibleClient,
  getOpenAiCompatibleLanguageModel,
  OPENAI_COMPATIBLE_CONFIG_MISSING_MESSAGE,
} from "@/lib/llm/providers/openai-compatible";
export {
  createVercelGatewayOpenAIClient,
  getVercelGatewayLanguageModel,
} from "@/lib/llm/providers/vercel-gateway";

import { getGlobalLlmModelId, parseLlmProviderId } from "@/lib/llm/config";
import { getGeminiLanguageModel } from "@/lib/llm/providers/gemini.stub";
import { getOpenAiCompatibleLanguageModel } from "@/lib/llm/providers/openai-compatible";
import { getVercelGatewayLanguageModel } from "@/lib/llm/providers/vercel-gateway";

/** Returns a language model from the configured provider. */
export function getConfiguredLanguageModel(modelId = getGlobalLlmModelId()) {
  const provider = parseLlmProviderId();
  if (provider === "gemini") {
    return getGeminiLanguageModel(modelId);
  }
  if (provider === "openai_compatible") {
    return getOpenAiCompatibleLanguageModel(modelId);
  }
  return getVercelGatewayLanguageModel(modelId);
}
