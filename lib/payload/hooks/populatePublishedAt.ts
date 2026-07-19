import type { CollectionBeforeChangeHook } from 'payload'

// Auto-sets `publishedAt` the first time a document is saved without one —
// ported as-is from payload-poc, no business-specific logic here.
export const populatePublishedAt: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation === 'create' || operation === 'update') {
    if (req.data && !req.data.publishedAt) {
      return { ...data, publishedAt: new Date() }
    }
  }
  return data
}
