import { openai, createOpenAI } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";
import { google } from "@ai-sdk/google";
import { ollama } from "ollama-ai-provider";
import { APICallError, type LanguageModel } from "ai";

// Pluggable AI provider — see docs/decisions.md "AI provider abstraction:
// pluggable". The original project this toolkit generalized from was
// locked to Azure OpenAI specifically; this toolkit abstracts over
// providers via the Vercel AI SDK instead, selected by AI_PROVIDER.
//
// Add a provider by installing its @ai-sdk/* package and a case below —
// nothing that calls getModel() needs to change.
//
// OpenRouter has no @ai-sdk/* provider compatible with this project's
// ai@^4 (the official @openrouter/ai-sdk-provider package requires ai@^6).
// It's OpenAI-API-compatible though, so createOpenAI with its baseURL is
// OpenRouter's own documented integration path for AI SDK v4 — not a hack.
const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// modelName lets a caller override the default (e.g. from a per-prompt
// AiPromptConfig.model value); omit it to use the provider's default.
// providerOverride lets a caller (the fallback chain below) request a
// specific provider regardless of AI_PROVIDER, e.g. when retrying against
// the next provider in the chain.
export function getModel(
  modelName?: string,
  providerOverride?: string,
): LanguageModel {
  const provider = providerOverride ?? process.env.AI_PROVIDER ?? "openai";

  switch (provider) {
    case "openai":
      return openai(modelName ?? "gpt-4o");
    case "groq":
      // Free tier — see GROQ_API_KEY in .env.example.
      return groq(modelName ?? "llama-3.3-70b-versatile");
    case "google":
      // Free tier — see GOOGLE_GENERATIVE_AI_API_KEY in .env.example.
      return google(modelName ?? "gemini-2.0-flash");
    case "openrouter":
      // ":free" suffix selects OpenRouter's free-tier variant of the model.
      return openrouter(modelName ?? "meta-llama/llama-3.3-70b-instruct:free");
    case "ollama":
      return ollama(modelName ?? process.env.OLLAMA_MODEL ?? "gemma4:latest");
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}

// Ordered list of providers to try: AI_PROVIDER first, then
// AI_PROVIDER_FALLBACK_ORDER (comma-separated, e.g. "groq,google,openrouter")
// for the rest. Opt-in — with no fallback var set this is just [AI_PROVIDER],
// same single-provider behavior as before this existed.
export function getProviderChain(): string[] {
  const primary = process.env.AI_PROVIDER ?? "openai";
  const fallbacks = (process.env.AI_PROVIDER_FALLBACK_ORDER ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry !== primary);

  return [primary, ...fallbacks];
}

// A prompt's stored `model` value is provider-specific (e.g. "gpt-4o" means
// nothing to Groq), so a caller falling back to a different provider should
// not reuse it — this only identifies whether an error is worth falling
// back for at all (quota/rate-limit), not which model to retry with.
export function isRetryableProviderError(error: unknown): boolean {
  return APICallError.isInstance(error) && error.statusCode === 429;
}
