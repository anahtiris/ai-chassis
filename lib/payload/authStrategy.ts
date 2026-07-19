import type { AuthStrategy } from 'payload'
import { getToken } from 'next-auth/jwt'

/**
 * Authenticates the Payload admin (/admin/cms) from the SAME Auth.js session
 * cookie the toolkit's own /admin/* portal uses (see auth.ts) — so operators
 * sign in once, with whichever provider this project has enabled (Credentials
 * by default, Entra ID optionally), and never touch a separate Payload
 * password or hit the create-first-user screen.
 *
 * Ported from the original project's payload-poc (payload/auth/entraStrategy.ts),
 * generalized: the POC decoded its own hand-rolled HS256 JWT via a custom
 * verifySession() helper; this toolkit uses Auth.js, so the equivalent is
 * next-auth/jwt's getToken() — Auth.js's own public API for reading its
 * session cookie outside of a Next.js request context, which is exactly the
 * situation a Payload AuthStrategy runs in (it gets raw `headers`, not a full
 * Next.js request/response cycle). getToken() also takes care of the
 * cookie-name/secure-prefix and salt-derivation details Auth.js v5's JWT
 * encoding requires — deliberately not hand-rolled, unlike the POC's version,
 * since getting those details wrong silently fails to decode valid sessions.
 *
 * The matching Payload `users` row is provisioned on first sight (keyed by
 * email) so the admin UI (relationships, access control, "last edited by")
 * has a real document to attach to. See payload.config.ts's `users`
 * collection: the local strategy is disabled there, so no password is ever
 * stored — authentication is the Auth.js cookie alone.
 */
export const authjsStrategy: AuthStrategy = {
  name: 'authjs-session',
  authenticate: async ({ headers, payload }) => {
    const secret = process.env.AUTH_SECRET
    if (!secret) return { user: null }

    const token = await getToken({
      req: { headers },
      secret,
      secureCookie: process.env.NODE_ENV === 'production',
    })
    if (!token?.email || typeof token.email !== 'string') return { user: null }

    const { docs } = await payload.find({
      collection: 'users',
      where: { email: { equals: token.email } },
      limit: 1,
      overrideAccess: true,
    })

    const user =
      docs[0] ??
      (await payload.create({
        collection: 'users',
        data: {
          email: token.email,
          name: typeof token.name === 'string' && token.name ? token.name : token.email,
        },
        overrideAccess: true,
      }))

    return { user: { ...user, collection: 'users' } }
  },
}
