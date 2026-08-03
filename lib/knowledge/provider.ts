// Pluggable knowledge layer for the AI concierge — see docs/decisions.md
// "AI knowledge layer is pluggable" and "RAG implementation:
// payloadcms-vectorize + pgvector, not Payload's native offering".
//
// Two implementations behind one interface:
//   - direct injection (default): simplest, cheapest, most deterministic —
//     right choice while content volume is small.
//   - RAG (opt-in, RAG_ENABLED=true): embeddings + vector similarity search
//     via payloadcms-vectorize, querying the "content" knowledge pool
//     configured in payload.config.ts.

import { getVectorizedPayload } from "payloadcms-vectorize";
import { getPayloadClient } from "@/lib/payload/client";
import { lexicalToPlainText } from "@/lib/payload/lexicalToPlainText";
import { isWebSearchConfigured, searchWeb } from "./webSearch";

export interface KnowledgeChunk {
  content: string;
  source: string;
  sourceUrl?: string;
}

export interface KnowledgeProvider {
  getRelevantKnowledge(query: string): Promise<KnowledgeChunk[]>;
}

// Default provider: pulls all published `pages` content directly, no
// embeddings involved. Ignores `query` by design — direct injection means
// "dump everything," matching the class doc comment above (right choice
// while content volume is small; RagProvider below does relevance
// filtering instead).
class DirectInjectionProvider implements KnowledgeProvider {
  async getRelevantKnowledge(_query: string): Promise<KnowledgeChunk[]> {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "pages",
      where: { _status: { equals: "published" } },
      limit: 50,
      depth: 0,
    });

    return docs.flatMap((page): KnowledgeChunk[] => {
      const chunks: KnowledgeChunk[] = [];
      const sourceUrl = `/${page.slug}`;

      if (page.title.trim()) {
        chunks.push({ content: page.title, source: "pages", sourceUrl });
      }

      // Only `content` blocks carry prose worth feeding to the concierge —
      // mediaBlock/formBlock have no text of their own here.
      for (const block of page.layout ?? []) {
        if (block.blockType !== "content") continue;
        for (const column of block.columns ?? []) {
          const bodyText = lexicalToPlainText(column.richText?.root).trim();
          if (bodyText)
            chunks.push({ content: bodyText, source: "pages", sourceUrl });
        }
      }

      return chunks;
    });
  }
}

// RAG provider: pgvector similarity search via payloadcms-vectorize against
// the "content" pool defined in payload.config.ts (fed by the starter
// `pages` collection — extend both together as content types grow).
class RagProvider implements KnowledgeProvider {
  async getRelevantKnowledge(query: string): Promise<KnowledgeChunk[]> {
    const payload = await getPayloadClient();
    const vectorizedPayload = getVectorizedPayload(payload);

    if (!vectorizedPayload) {
      // Shouldn't happen if RAG_ENABLED matched at config-build time too
      // (payload.config.ts only registers the plugin when it's true) — but
      // fail loudly rather than silently returning no knowledge if it does.
      throw new Error(
        "RAG_ENABLED is true but payloadcms-vectorize is not registered on this Payload instance — check payload.config.ts was built with RAG_ENABLED=true.",
      );
    }

    const results = await vectorizedPayload.search({
      query,
      knowledgePool: "content",
      limit: 5,
    });

    return results.map((result) => {
      const slug =
        "slug" in result && typeof result.slug === "string"
          ? result.slug
          : undefined;
      return {
        content: result.chunkText,
        source: result.sourceCollection,
        sourceUrl: slug ? `/${slug}` : undefined,
      };
    });
  }
}

// Wraps another provider: falls back to a live web search (see
// lib/knowledge/webSearch.ts) when the base provider finds nothing for a
// query — most relevant under RagProvider, whose similarity search can
// legitimately come back empty for questions the indexed content doesn't
// cover. Only applied when a web search provider is actually configured;
// otherwise getKnowledgeProvider() returns the base provider unwrapped, the
// same default-off pattern as RAG/storage.
class WebSearchFallbackProvider implements KnowledgeProvider {
  constructor(private readonly base: KnowledgeProvider) {}

  async getRelevantKnowledge(query: string): Promise<KnowledgeChunk[]> {
    const chunks = await this.base.getRelevantKnowledge(query);
    if (chunks.length > 0) return chunks;

    try {
      return await searchWeb(query);
    } catch (error) {
      console.warn("[knowledge] web search fallback failed:", error);
      return [];
    }
  }
}

export function getKnowledgeProvider(): KnowledgeProvider {
  const ragEnabled = process.env.RAG_ENABLED === "true";
  const base: KnowledgeProvider = ragEnabled
    ? new RagProvider()
    : new DirectInjectionProvider();

  return isWebSearchConfigured() ? new WebSearchFallbackProvider(base) : base;
}
