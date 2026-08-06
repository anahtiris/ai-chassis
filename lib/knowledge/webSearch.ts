// Pluggable web search, used only as a fallback by
// WebSearchFallbackProvider in provider.ts when the primary knowledge
// provider finds nothing for a query. Selected by WEB_SEARCH_PROVIDER, same
// pattern as lib/ai/provider.ts's AI_PROVIDER — add another provider by
// adding a case here, nothing that calls searchWeb() needs to change.
import type { KnowledgeChunk } from "./provider";

type WebSearchProviderName = "tavily" | "google";

// Bounds how long a search can stall the concierge request that triggered
// it — without this, an unresponsive search host holds the connection open
// until undici's 300s default. On timeout the fetch rejects and
// WebSearchFallbackProvider degrades to "no context" rather than hanging.
const SEARCH_TIMEOUT_MS = 8000;

function getWebSearchProviderName(): WebSearchProviderName {
  return (process.env.WEB_SEARCH_PROVIDER as WebSearchProviderName) ?? "tavily";
}

// True once whichever provider WEB_SEARCH_PROVIDER points at has its
// required env vars set — the gate getKnowledgeProvider() uses to decide
// whether to wrap the base provider in fallback at all.
export function isWebSearchConfigured(): boolean {
  switch (getWebSearchProviderName()) {
    case "tavily":
      return Boolean(process.env.TAVILY_API_KEY);
    case "google":
      return Boolean(
        process.env.GOOGLE_SEARCH_API_KEY &&
        process.env.GOOGLE_SEARCH_ENGINE_ID,
      );
    default:
      return false;
  }
}

export async function searchWeb(query: string): Promise<KnowledgeChunk[]> {
  switch (getWebSearchProviderName()) {
    case "tavily":
      return searchTavily(query);
    case "google":
      return searchGoogle(query);
    default:
      throw new Error(
        `Unknown WEB_SEARCH_PROVIDER: ${getWebSearchProviderName()}`,
      );
  }
}

async function searchTavily(query: string): Promise<KnowledgeChunk[]> {
  // Tavily authenticates via an Authorization: Bearer header — the older
  // `api_key` body field is gone from the current API
  // (docs.tavily.com/api-reference/endpoint/search).
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({ query, max_results: 5 }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Tavily search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    results?: Array<{ content?: string; url?: string }>;
  };

  return (data.results ?? [])
    .filter((result): result is { content: string; url?: string } =>
      Boolean(result.content),
    )
    .map((result) => ({
      content: result.content,
      source: "web",
      sourceUrl: result.url,
    }));
}

async function searchGoogle(query: string): Promise<KnowledgeChunk[]> {
  const params = new URLSearchParams({
    key: process.env.GOOGLE_SEARCH_API_KEY ?? "",
    cx: process.env.GOOGLE_SEARCH_ENGINE_ID ?? "",
    q: query,
    num: "5",
  });

  const res = await fetch(
    `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
    { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
  );

  if (!res.ok) {
    throw new Error(`Google search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    items?: Array<{ snippet?: string; link?: string }>;
  };

  return (data.items ?? [])
    .filter((item): item is { snippet: string; link?: string } =>
      Boolean(item.snippet),
    )
    .map((item) => ({
      content: item.snippet,
      source: "web",
      sourceUrl: item.link,
    }));
}
