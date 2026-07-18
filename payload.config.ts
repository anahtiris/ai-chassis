import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'

// CMS-managed content only — see docs/decisions.md "Admin portal scope" and
// "CMS and admin share one Postgres instance, as two schemas". Everything
// domain-agnostic-but-not-content (audit log, form results, users,
// analytics) lives in Prisma's `app` schema instead — see prisma/schema.prisma.
export default buildConfig({
  editor: lexicalEditor(),
  collections: [
    // Starter content collection. Add Posts/Categories/Media/etc. per
    // project as needed — this is intentionally minimal.
    {
      slug: 'pages',
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true, unique: true },
        { name: 'content', type: 'richText' },
      ],
    },
  ],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    schemaName: 'payload',
  }),
  secret: process.env.PAYLOAD_SECRET ?? '',
  typescript: {
    outputFile: 'payload-types.ts',
  },
})
