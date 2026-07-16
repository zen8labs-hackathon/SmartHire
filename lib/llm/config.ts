import { GEMINI_API_KEY_MISSING_MESSAGE } from "@/lib/llm/providers/gemini.stub";
import { OPENAI_COMPATIBLE_CONFIG_MISSING_MESSAGE } from "@/lib/llm/providers/openai-compatible";
import type { LlmProviderId } from "@/lib/llm/types";

const VERCEL_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

/**
 * Which backend to use. Default: `vercel_gateway`.
 * `gemini` is reserved and not wired yet (see `providers/gemini.stub.ts`).
 * `openai_compatible` / `litellm` → any OpenAI-compatible `/v1` proxy (e.g. LiteLLM).
 */
export function parseLlmProviderId(): LlmProviderId {
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (raw === "gemini") return "gemini";
  if (raw === "openai_compatible" || raw === "litellm") {
    return "openai_compatible";
  }
  return "vercel_gateway";
}

/**
 * Single global model id for the selected provider.
 *
 * Resolution order:
 * 1. `LLM_MODEL`
 * 2. `AI_GATEWAY_JD_MATCH_MODEL` (legacy name, kept for backward compatibility)
 * 3. Provider default (`openai/gpt-4o-mini` for Vercel gateway / OpenAI-compatible, `gemini-2.0-flash` for Gemini)
 */
/** Model for JD document extraction (defaults to {@link getGlobalLlmModelId}). */
export function getJdExtractModelId(): string {
  const explicit = process.env.LLM_JD_EXTRACT_MODEL?.trim();
  if (explicit) return explicit;
  return getGlobalLlmModelId();
}

export function getGlobalLlmModelId(): string {
  const explicit = process.env.LLM_MODEL?.trim();
  if (explicit) return explicit;
  const legacy = process.env.AI_GATEWAY_JD_MATCH_MODEL?.trim();
  if (legacy) return legacy;
  if (parseLlmProviderId() === "gemini") return "gemini-2.0-flash";
  return "openai/gpt-4o-mini";
}

export function getVercelAiGatewayBaseUrl(): string {
  return VERCEL_AI_GATEWAY_BASE_URL;
}

/**
 * Base URL for OpenAI-compatible providers (must include `/v1`).
 * Trailing slashes are stripped.
 */
export function getOpenAiCompatibleBaseUrl(): string | null {
  const raw = process.env.LLM_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/**
 * True when the selected provider can run inference in this deployment.
 */
export function isLlmInferenceConfigured(): boolean {
  const provider = parseLlmProviderId();
  if (provider === "gemini") {
    return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
  }
  if (provider === "openai_compatible") {
    return Boolean(
      process.env.LLM_API_KEY?.trim() && getOpenAiCompatibleBaseUrl(),
    );
  }
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

/** Human-readable reason when {@link isLlmInferenceConfigured} is false. */
export function llmInferenceDisabledReason(): string {
  const provider = parseLlmProviderId();
  if (provider === "gemini") return GEMINI_API_KEY_MISSING_MESSAGE;
  if (provider === "openai_compatible") {
    return OPENAI_COMPATIBLE_CONFIG_MISSING_MESSAGE;
  }
  return "LLM inference is disabled (missing AI_GATEWAY_API_KEY for LLM_PROVIDER=vercel_gateway).";
}
