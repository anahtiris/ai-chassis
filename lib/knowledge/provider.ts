// Pluggable knowledge layer for the AI concierge — see docs/decisions.md
// "AI knowledge layer is pluggable" and "RAG implementation:
// payloadcms-vectorize + pgvector, not Payload's native offering".
//
// Two implementations behind one interface:
//   - direct injection (default): simplest, cheapest, most deterministic —
//     right choice while content volume is small.
//   - RAG (opt-in, RAG_ENABLED=true): embeddings + vector similarity search
//     via payloadcms-vectorize once content volume outgrows what
//     comfortably fits in a prompt. Not implemented yet — this is the
//     interface it plugs into when it is.

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

// RAG provider: pgvector similarity search via payloadcms-vectorize, once
// that plugin is installed and configured. Stubbed until then.
class RagProvider implements KnowledgeProvider {
  async getRelevantKnowledge(_query: string): Promise<KnowledgeChunk[]> {
    throw new Error(
      'RAG_ENABLED is true but the payloadcms-vectorize integration is not wired up yet.',
    )
  }
}

export function getKnowledgeProvider(): KnowledgeProvider {
  const ragEnabled = process.env.RAG_ENABLED === 'true'
  return ragEnabled ? new RagProvider() : new DirectInjectionProvider()
}
