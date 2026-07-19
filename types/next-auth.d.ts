import type { DefaultSession } from 'next-auth'

// Auth.js's default Session/JWT shapes don't carry our own database id or
// the owner bypass flag — module augmentation adds them so `session.user.id`
// and `session.user.isOwner` typecheck everywhere they're used (see auth.ts
// callbacks, lib/auth/permissions.ts).
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      isOwner: boolean
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isOwner?: boolean
  }
}
