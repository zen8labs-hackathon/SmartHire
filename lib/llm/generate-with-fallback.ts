import { generateText } from "ai";

import {
  getFallbackLlmModelId,
  getGlobalLlmModelId,
  isLlmFallbackConfigured,
  parseLlmProviderId,
} from "@/lib/llm/config";
import { getVercelGatewayLanguageModel } from "@/lib/llm/providers/vercel-gateway";
import type { LlmProviderId } from "@/lib/llm/types";

type GenerateTextArgs = Parameters<typeof generateText>[0];

export type LlmCallMeta = {
  provider: LlmProviderId;
  modelId: string;
  usedFallback: boolean;
};

/**
 * Runs {@link generateText}; on failure, retries once via Vercel AI Gateway
 * when {@link isLlmFallbackConfigured} is true (primary is not already Vercel).
 * Always attaches {@link LlmCallMeta} for which backend actually answered.
 */
export async function generateTextWithFallback(options: GenerateTextArgs) {
  try {
    const result = await generateText(options);
    return Object.assign(result, {
      llmMeta: {
        provider: parseLlmProviderId(),
        modelId: getGlobalLlmModelId(),
        usedFallback: false,
      } satisfies LlmCallMeta,
    });
  } catch (primaryError) {
    if (
      !isLlmFallbackConfigured() ||
      parseLlmProviderId() === "vercel_gateway"
    ) {
      throw primaryError;
    }
    const modelId = getFallbackLlmModelId();
    const result = await generateText({
      ...options,
      model: getVercelGatewayLanguageModel(modelId),
    });
    return Object.assign(result, {
      llmMeta: {
        provider: "vercel_gateway",
        modelId,
        usedFallback: true,
      } satisfies LlmCallMeta,
    });
  }
}

/** Short label for UI / rationale footnotes. */
export function formatLlmCallLabel(meta: LlmCallMeta): string {
  const via = meta.usedFallback ? " via Vercel fallback" : "";
  return `${meta.provider} / ${meta.modelId}${via}`;
}
