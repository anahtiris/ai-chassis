import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Pluggable AI provider — see docs/decisions.md "AI provider abstraction:
// pluggable". The original project this toolkit generalized from was
// locked to Azure OpenAI specifically; this toolkit abstracts over
// providers via the Vercel AI SDK instead, selected by AI_PROVIDER.
//
// Add a provider by installing its @ai-sdk/* package and a case below —
// nothing that calls getModel() needs to change.
//
// modelName lets a caller override the default (e.g. from a per-prompt
// AiPromptConfig.model value); omit it to use the provider's default.
export function getModel(modelName?: string): LanguageModel {
  const provider = process.env.AI_PROVIDER ?? "openai";

  switch (provider) {
    case "openai":
      return openai(modelName ?? "gpt-4o");
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}
