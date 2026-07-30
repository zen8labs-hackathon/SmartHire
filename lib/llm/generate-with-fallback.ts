import { generateText } from "ai";

import {
  getFallbackLlmModelId,
  getGlobalLlmModelId,
  isLlmFallbackConfigured,
  parseLlmProviderId,
} from "@/lib/llm/config";
import { getVercelGatewayLanguageModel } from "@/lib/llm/providers/vercel-gateway";
import type { LlmProviderId } from "@/lib/llm/types";
import { logError, toError } from "@/lib/logger";

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
export async function generateTextWithFallback(
  options: GenerateTextArgs,
  createFallbackAbortSignal?: () => AbortSignal,
) {
  try {
    const result = await generateText(options);
    // `Output.object()` is validated lazily by the AI SDK when `output` is
    // read. Force that read inside this try block so missing/invalid
    // structured output also triggers the configured fallback.
    void result.output;
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
      logError("LLM generate failed (no fallback)", toError(primaryError), {
        provider: parseLlmProviderId(),
        modelId: getGlobalLlmModelId(),
      });
      throw primaryError;
    }
    const modelId = getFallbackLlmModelId();
    try {
      const result = await generateText({
        ...options,
        model: getVercelGatewayLanguageModel(modelId),
        abortSignal: createFallbackAbortSignal?.() ?? options.abortSignal,
      });
      // Surface a fallback model's invalid structured output to the caller.
      void result.output;
      return Object.assign(result, {
        llmMeta: {
          provider: "vercel_gateway",
          modelId,
          usedFallback: true,
        } satisfies LlmCallMeta,
      });
    } catch (fallbackError) {
      logError("LLM generate failed (primary and fallback)", toError(fallbackError), {
        primaryProvider: parseLlmProviderId(),
        primaryModelId: getGlobalLlmModelId(),
        fallbackModelId: modelId,
        primaryError: primaryError instanceof Error ? primaryError.message : String(primaryError),
      });
      throw fallbackError;
    }
  }
}

/** Short label for UI / rationale footnotes. */
export function formatLlmCallLabel(meta: LlmCallMeta): string {
  const via = meta.usedFallback ? " via Vercel fallback" : "";
  return `${meta.provider} / ${meta.modelId}${via}`;
}
