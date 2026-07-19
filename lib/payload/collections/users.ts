import type { CollectionConfig } from 'payload'
import { authenticated } from '../access'
import { authjsStrategy } from '../authStrategy'

// Satisfies Payload's required admin.user auth collection — but operator
// identity/permissions actually live in Prisma's `app.User` table (see
// prisma/schema.prisma), not here. This collection only exists so Payload
// has somewhere to attach a document to; see lib/payload/authStrategy.ts for
// the single-sign-on bridge that provisions rows here automatically. Also
// doubles as the `relationTo: 'users'` target for Posts' `authors` field —
// these ARE the CMS operators, so that's a reasonable reuse, not a layering
// violation.
export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
    // Hidden from the CMS nav — same reasoning as above: this isn't where
    // operators are actually managed (that's /admin/users, backed by
    // Prisma).
    hidden: true,
  },
  // Auth.js only. Disabling the local strategy removes password login AND
  // the create-first-user flow entirely — Payload no longer demands a first
  // user when this table is empty. Operators are resolved from the Auth.js
  // session cookie by authjsStrategy, which provisions the row on first
  // sign-in — see lib/auth/permissions.ts for the *separate* authorization
  // layer (this collection is authentication only, not permissions).
  auth: {
    disableLocalStrategy: true,
    strategies: [authjsStrategy],
  },
  fields: [
    { name: 'name', type: 'text' },
    {
      // disableLocalStrategy removes Payload's auto `email` field, so
      // declare it explicitly — authjsStrategy keys the user on it.
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      index: true,
    },
  ],
  timestamps: true,
}
