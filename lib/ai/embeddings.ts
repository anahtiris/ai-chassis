import { embed, embedMany } from 'ai'
import { openai } from '@ai-sdk/openai'

// Embedding side of the pluggable AI-provider abstraction (see
// lib/ai/provider.ts) — kept on the same AI_PROVIDER knob rather than
// introducing a separate embedding-specific provider dependency (the
// payloadcms-vectorize docs default to Voyage AI; this toolkit reuses
// whatever chat provider is already configured instead, so there's one
// provider decision per project, not two).
//
// EMBEDDING_DIMS must match the `dims` passed to
// createPostgresVectorIntegration in payload.config.ts — change both
// together. Changing it after data has been embedded is destructive; see
// @payloadcms-vectorize/pg's "Changing dims" migration steps.
const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMS = 1536

function getEmbeddingModel() {
  const provider = process.env.AI_PROVIDER ?? 'openai'

  switch (provider) {
    case 'openai':
      return openai.embedding(EMBEDDING_MODEL)
    default:
      throw new Error(`Unknown AI_PROVIDER for embeddings: ${provider}`)
  }
}

export async function embedDocs(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: getEmbeddingModel(), values: texts })
  return embeddings
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: getEmbeddingModel(), value: text })
  return embedding
}
