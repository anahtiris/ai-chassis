import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { revalidateTag } from 'next/cache'

/**
 * Generic Next.js cache revalidation for a versioned (drafts-enabled)
 * collection — tag-based rather than path-based, unlike the original
 * project's payload-poc (which called `revalidatePath()` against its own
 * fixed `/industries/[industry]/[slug]` routes). This toolkit has no public
 * content routes of its own yet — a fork adds those per project — so tying
 * revalidation to concrete URLs isn't generic. Tag-based means a project's
 * own routes opt in by fetching with `{ next: { tags: [tag] } }` (or
 * `unstable_cache`'s `tags` option); nothing here needs to change when those
 * routes get built. Same pattern already used by
 * lib/payload/concierge/hooks.ts's revalidateAiConcierge.
 */
export function createRevalidateHooks(tag: string): {
  afterChange: CollectionAfterChangeHook
  afterDelete: CollectionAfterDeleteHook
} {
  return {
    afterChange: ({ doc, previousDoc, req: { payload, context } }) => {
      if (context.disableRevalidate) return doc

      const isVersioned = doc._status !== undefined
      const shouldRevalidate =
        !isVersioned || doc._status === 'published' || previousDoc?._status === 'published'

      if (shouldRevalidate) {
        payload.logger.info(`Revalidating tag: ${tag}`)
        revalidateTag(tag, 'max')
      }
      return doc
    },
    afterDelete: ({ doc, req: { context } }) => {
      if (!context.disableRevalidate) revalidateTag(tag, 'max')
      return doc
    },
  }
}
