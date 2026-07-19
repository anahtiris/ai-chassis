import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'
import { anyone } from '../access'
import { authenticated } from '../access'

// Minimal taxonomy collection for grouping Posts. Ported from payload-poc,
// stripped of nothing business-specific — this one was already generic.
export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
  ],
}
