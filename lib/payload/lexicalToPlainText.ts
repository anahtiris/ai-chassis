// Minimal Lexical-JSON-to-plain-text walker — good enough for embedding and
// direct-injection purposes (neither needs formatting preserved). Shared
// between payload.config.ts's RAG knowledge-pool feed and
// lib/knowledge/provider.ts's DirectInjectionProvider so both read the same
// content the same way. Swap for a richer chunker (see
// payloadcms-vectorize's dev/helpers/chunkers.ts for a reference
// implementation) if a project wants heading- or paragraph-aware chunks.
export function lexicalToPlainText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const { text, children } = node as { text?: unknown; children?: unknown[] }
  const own = typeof text === 'string' ? text : ''
  const nested = Array.isArray(children)
    ? children.map(lexicalToPlainText).join(' ')
    : ''
  return [own, nested].filter(Boolean).join(' ')
}
