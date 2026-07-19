import type { CollectionConfig } from 'payload'
import { FixedToolbarFeature, InlineToolbarFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'
import { anyone, authenticated } from '../access'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Local-disk storage under public/media, publicly readable/servable outside
// Payload too. Swap for an S3-compatible adapter (see .env.example's
// STORAGE_* vars, currently unused — a fork wires one of Payload's storage
// plugins per its own production target) without changing this collection's
// shape.
export const Media: CollectionConfig = {
  slug: 'media',
  folders: true,
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  fields: [
    { name: 'alt', type: 'text' },
    {
      name: 'caption',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()],
      }),
    },
  ],
  upload: {
    staticDir: path.resolve(dirname, '../../../public/media'),
    adminThumbnail: 'thumbnail',
    focalPoint: true,
    imageSizes: [
      { name: 'thumbnail', width: 300 },
      { name: 'square', width: 500, height: 500 },
      { name: 'small', width: 600 },
      { name: 'medium', width: 900 },
      { name: 'large', width: 1400 },
      { name: 'og', width: 1200, height: 630, crop: 'center' },
    ],
  },
}
