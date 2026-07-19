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

import { getVectorizedPayload } from 'payloadcms-vectorize'
import { getPayloadClient } from '@/lib/payload/client'

export interface KnowledgeChunk {
  content: string
  source: string
  sourceUrl?: string
}

export interface KnowledgeProvider {
  getRelevantKnowledge(query: string): Promise<KnowledgeChunk[]>
}

// Default provider: pulls all content matching a page/category context
// directly, no embeddings involved. Project-specific — wire this up to
// whichever Payload collection(s) should feed the concierge.
class DirectInjectionProvider implements KnowledgeProvider {
  async getRelevantKnowledge(_query: string): Promise<KnowledgeChunk[]> {
    // TODO: query the relevant Payload collection(s) directly and return
    // their content as chunks. Left unimplemented — this is the toolkit's
    // scaffold, not a finished feature; each project wires this to its own
    // content shape.
    return []
  }
}

// RAG provider: pgvector similarity search via payloadcms-vectorize against
// the "content" pool defined in payload.config.ts (fed by the starter
// `pages` collection — extend both together as content types grow).
class RagProvider implements KnowledgeProvider {
  async getRelevantKnowledge(query: string): Promise<KnowledgeChunk[]> {
    const payload = await getPayloadClient()
    const vectorizedPayload = getVectorizedPayload(payload)

    if (!vectorizedPayload) {
      // Shouldn't happen if RAG_ENABLED matched at config-build time too
      // (payload.config.ts only registers the plugin when it's true) — but
      // fail loudly rather than silently returning no knowledge if it does.
      throw new Error(
        'RAG_ENABLED is true but payloadcms-vectorize is not registered on this Payload instance — check payload.config.ts was built with RAG_ENABLED=true.',
      )
    }

    const results = await vectorizedPayload.search({ query, knowledgePool: 'content', limit: 5 })

    return results.map((result) => {
      const slug = 'slug' in result && typeof result.slug === 'string' ? result.slug : undefined
      return {
        content: result.chunkText,
        source: result.sourceCollection,
        sourceUrl: slug ? `/${slug}` : undefined,
      }
    })
  }
}

export function getKnowledgeProvider(): KnowledgeProvider {
  const ragEnabled = process.env.RAG_ENABLED === 'true'
  return ragEnabled ? new RagProvider() : new DirectInjectionProvider()
}
