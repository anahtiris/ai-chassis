import NextAuth from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'

// Single source of truth for session verification — imported by proxy.ts,
// route handlers, and server components alike. See docs/decisions.md
// "Auth/permission checking implemented once": this covers session
// *verification* only ("who is this, is the session valid"). What a
// verified identity is *allowed to do* (authorization) is checked
// separately, per area, against prisma's UserPermission model — not here.
//
// Microsoft Entra ID is the first provider wired up, carried over from the
// project this toolkit's patterns were generalized from. Add more of
// Auth.js's ~80 built-in providers per project as needed.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
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
})
