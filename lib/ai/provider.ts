import { openai, createOpenAI } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";
import { google } from "@ai-sdk/google";
import { ollama } from "ollama-ai-provider";
import type { LanguageModel } from "ai";

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
export function getModel(modelName?: string): LanguageModel {
  const provider = process.env.AI_PROVIDER ?? "openai";

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
