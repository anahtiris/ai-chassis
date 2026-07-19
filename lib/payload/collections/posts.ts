import type { CollectionConfig } from 'payload'
import {
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { slugField } from 'payload'
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import { authenticated, authenticatedOrPublished } from '../access'
import { populatePublishedAt } from '../hooks/populatePublishedAt'
import { populateAuthors } from '../hooks/populateAuthors'
import { createRevalidateHooks } from '../hooks/revalidateCollection'
import { defaultPageConciergeQuestions } from '../concierge/defaultPageQuestions'

// Blog/article collection: title + hero image + rich text + categories +
// authors, versioned drafts, SEO fields, AI Concierge question override.
// No page-builder blocks — same reasoning as pages.ts. Generalized from
// payload-poc's Posts collection, which additionally assumed a fixed
// `/industries/<category>/<slug>` URL structure; that's business-specific
// routing this toolkit doesn't have an opinion on, so it's gone — a fork
// decides its own post URL shape when it builds a public route.
const { afterChange: revalidateAfterChange, afterDelete: revalidateAfterDelete } =
  createRevalidateHooks('posts')

export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: {
    title: true,
    slug: true,
    categories: true,
    meta: { image: true, description: true },
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'heroImage', type: 'upload', relationTo: 'media' },
            {
              name: 'content',
              type: 'richText',
              editor: lexicalEditor({
                features: ({ rootFeatures }) => [
                  ...rootFeatures,
                  HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  FixedToolbarFeature(),
                  InlineToolbarFeature(),
                  HorizontalRuleFeature(),
                ],
              }),
              label: false,
              required: true,
            },
          ],
        },
        {
          label: 'Meta',
          fields: [
            {
              name: 'relatedPosts',
              type: 'relationship',
              admin: { position: 'sidebar' },
              filterOptions: ({ id }) => ({ id: { not_in: [id] } }),
              hasMany: true,
              relationTo: 'posts',
            },
            {
              name: 'categories',
              type: 'relationship',
              admin: { position: 'sidebar' },
              hasMany: true,
              relationTo: 'categories',
            },
          ],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({ hasGenerateFn: true }),
            MetaImageField({ relationTo: 'media' }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
        {
          name: 'aiConcierge',
          label: 'AI Concierge',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: true,
              label: 'Enable AI Concierge on this page',
            },
            {
              name: 'questions',
              type: 'array',
              minRows: 0,
              label: 'Questions for this page',
              labels: { singular: 'Question', plural: 'Questions' },
              defaultValue: defaultPageConciergeQuestions,
              fields: [
                { name: 'question', type: 'text', required: true },
                { name: 'enabled', type: 'checkbox', defaultValue: true, label: 'Show this question' },
              ],
              admin: { initCollapsed: false },
            },
          ],
        },
      ],
    },
    { name: 'publishedAt', type: 'date', admin: { position: 'sidebar' } },
    { name: 'authors', type: 'relationship', admin: { position: 'sidebar' }, hasMany: true, relationTo: 'users' },
    // Populated by populateAuthors — `users` has locked-down read access
    // (it's this toolkit's SSO-bridge collection, see payload.config.ts),
    // so authorship can't be resolved via the direct relationship alone.
    {
      name: 'populatedAuthors',
      type: 'array',
      access: { update: () => false },
      admin: { disabled: true, readOnly: true },
      fields: [
        { name: 'id', type: 'text' },
        { name: 'name', type: 'text' },
      ],
    },
    slugField(),
  ],
  hooks: {
    beforeChange: [populatePublishedAt],
    afterRead: [populateAuthors],
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
  },
  versions: {
    drafts: { autosave: { interval: 800 } },
    maxPerDoc: 50,
  },
}
