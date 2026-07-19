import type { CollectionAfterReadHook } from 'payload'

// The `users` collection's access control is locked down (see
// payload.config.ts's Users), so authors aren't publicly readable through
// the normal relationship — this populates a separate, read-only
// `populatedAuthors` field (id + name only) instead, hidden from the admin
// UI. Ported as-is from payload-poc; generic to any collection with an
// `authors` relationship field to `users` and a matching `populatedAuthors`
// array field.
export const populateAuthors: CollectionAfterReadHook = async ({ doc, req: { payload } }) => {
  const authors: unknown = doc?.authors
  if (!Array.isArray(authors) || authors.length === 0) return doc

  const populated: Array<{ id: string; name?: string | null }> = []

  for (const author of authors) {
    const id: string | number =
      typeof author === 'object' && author !== null ? (author as { id: string | number }).id : author
    try {
      const authorDoc = await payload.findByID({ id, collection: 'users', depth: 0 })
      // `populatedAuthors.id` is a plain text field (see collections/posts.ts) —
      // stringify regardless of whether `users.id` is numeric (serial) or a
      // UUID, so this doesn't break if that ever changes.
      if (authorDoc) populated.push({ id: String(authorDoc.id), name: authorDoc.name })
    } catch {
      // swallow — a stale/deleted author reference shouldn't break the read
    }
  }

  if (populated.length > 0) doc.populatedAuthors = populated
  return doc
}
