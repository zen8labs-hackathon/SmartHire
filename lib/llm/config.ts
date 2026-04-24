import { GEMINI_LLM_NOT_IMPLEMENTED_MESSAGE } from "@/lib/llm/providers/gemini.stub";
import type { LlmProviderId } from "@/lib/llm/types";

const VERCEL_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

/**
 * Which backend to use. Default: `vercel_gateway`.
 * `gemini` is reserved and not wired yet (see `providers/gemini.stub.ts`).
 */
export function parseLlmProviderId(): LlmProviderId {
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (raw === "gemini") return "gemini";
  return "vercel_gateway";
}

/**
 * Single global catalog model id for the Vercel AI Gateway (OpenAI-compatible surface).
 *
 * Resolution order:
 * 1. `LLM_MODEL`
 * 2. `AI_GATEWAY_JD_MATCH_MODEL` (legacy name, kept for backward compatibility)
 * 3. Default `openai/gpt-4o-mini`
 */
export function getGlobalLlmModelId(): string {
  return (
    process.env.LLM_MODEL?.trim() ||
    process.env.AI_GATEWAY_JD_MATCH_MODEL?.trim() ||
    "openai/gpt-4o-mini"
  );
}

export function getVercelAiGatewayBaseUrl(): string {
  return VERCEL_AI_GATEWAY_BASE_URL;
}

/**
 * True when the selected provider can run inference in this deployment.
 * For `gemini`, this stays false until a real provider is implemented.
 */
export function isLlmInferenceConfigured(): boolean {
  const provider = parseLlmProviderId();
  if (provider === "gemini") return false;
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

/** Human-readable reason when {@link isLlmInferenceConfigured} is false. */
export function llmInferenceDisabledReason(): string {
  if (parseLlmProviderId() === "gemini") return GEMINI_LLM_NOT_IMPLEMENTED_MESSAGE;
  return "LLM inference is disabled (missing AI_GATEWAY_API_KEY for LLM_PROVIDER=vercel_gateway).";
}
