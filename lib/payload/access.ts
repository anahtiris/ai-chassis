import type { Access, AccessArgs } from 'payload'

// Shared access-control predicates. Ported from the original project's
// payload-poc (payload/access/*.ts) — generic enough to reuse across every
// collection this toolkit or a fork adds.

/** Signed in (via authStrategy.ts's Auth.js bridge) or not. */
export const authenticated = ({ req: { user } }: AccessArgs): boolean => Boolean(user)

/** No restriction — for collections meant to be publicly readable (Media, Categories). */
export const anyone: Access = () => true

/**
 * Signed-in admins can read everything, including drafts. Anonymous readers
 * only see published documents — for collections with `versions.drafts`
 * enabled (Pages, Posts), where `_status` distinguishes the two.
 */
export const authenticatedOrPublished: Access = ({ req: { user } }) => {
  if (user) return true
  return { _status: { equals: 'published' } }
}
