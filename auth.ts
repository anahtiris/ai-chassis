import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/db/client'

// Single source of truth for session verification — imported by proxy.ts,
// route handlers, and server components alike. See docs/decisions.md
// "Auth/permission checking implemented once": this covers session
// *verification* only ("who is this, is the session valid"). What a
// verified identity is *allowed to do* (authorization) is checked
// separately, per area, via lib/auth/permissions.ts's hasPermission() — not
// here.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Default provider. Every fork of this toolkit can log into its own
    // admin portal out of the box, with zero external identity-provider
    // setup — no Entra tenant, no OAuth app registration required just to
    // get in the door. Checks the `password_hash` column on `User` (see
    // prisma/schema.prisma); seed the first admin with `pnpm seed:admin`
    // (see README "Getting started").
    Credentials({
      name: 'Username and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const email = credentials?.email
        const password = credentials?.password
        if (typeof email !== 'string' || typeof password !== 'string') return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.password_hash || user.archived_at) return null

        const valid = await compare(password, user.password_hash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
    // Optional, additional provider — not required to run this toolkit.
    // Unset AUTH_MICROSOFT_ENTRA_ID_* and it's simply unused; Auth.js
    // doesn't error on an unconfigured provider unless a sign-in against it
    // is actually attempted. Carried over from the project this toolkit's
    // patterns were generalized from. Swap in any of Auth.js's ~80 other
    // built-in providers per project the same way.
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/admin/login',
  },
  callbacks: {
    // Runs after any provider succeeds, before a session is created — the
    // one place both providers pass through, regardless of whether they
    // touched Prisma already (Credentials does, via authorize() above;
    // Entra ID doesn't, since it's a stateless OAuth provider with no
    // adapter configured).
    //
    // Bootstrap rule: if the database has no users at all yet, the very
    // first successful sign-in (from either provider) creates the User row
    // and marks it is_owner — see docs/decisions.md "Bootstrap: first user
    // is owner". After that, unrecognized emails are rejected rather than
    // silently auto-provisioned — anyone else in an Entra tenant
    // successfully completing OAuth should not, by itself, grant them a
    // login here; a User row has to already exist (seeded directly, or
    // later via the admin users UI once that's built).
    async signIn({ user }) {
      if (!user?.email) return false

      const existing = await prisma.user.findUnique({ where: { email: user.email } })
      if (existing) return !existing.archived_at

      const userCount = await prisma.user.count()
      if (userCount > 0) return false

      await prisma.user.create({
        data: { email: user.email, name: user.name ?? undefined, is_owner: true },
      })
      return true
    },
    // Credentials' authorize() and Entra ID's OAuth profile don't reliably
    // carry our own database id — look the row up by email once, on
    // initial sign-in, and cache it on the token so later requests don't
    // hit the database just to read the session.
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } })
        if (dbUser) {
          token.sub = dbUser.id
          token.isOwner = dbUser.is_owner
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.isOwner = Boolean(token.isOwner)
      }
      return session
    },
  },
})
