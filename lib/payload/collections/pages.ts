import type { CollectionConfig } from "payload";
import {
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";
import { slugField } from "payload";
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from "@payloadcms/plugin-seo/fields";
import { authenticated, authenticatedOrPublished } from "../access";
import { populatePublishedAt } from "../hooks/populatePublishedAt";
import { createRevalidateHooks } from "../hooks/revalidateCollection";
import { defaultPageConciergeSuggestions } from "../concierge/defaultPageSuggestions";

// Generic CMS page: title + rich text content, versioned drafts, SEO
// fields, and an AI Concierge question override — no page-builder block
// library (see docs/decisions.md "Collections: generic infrastructure only,
// no page-builder blocks" for why). Field names (title/slug/content) are
// load-bearing: payload.config.ts's RAG knowledge-pool feed reads them
// directly.
const {
  afterChange: revalidateAfterChange,
  afterDelete: revalidateAfterDelete,
} = createRevalidateHooks("pages");

export const Pages: CollectionConfig<"pages"> = {
  slug: "pages",
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: { title: true, slug: true },
  admin: {
    defaultColumns: ["title", "slug", "updatedAt"],
    useAsTitle: "title",
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      type: "tabs",
      tabs: [
        {
          label: "Content",
          fields: [
            {
              name: "content",
              type: "richText",
              editor: lexicalEditor({
                features: ({ rootFeatures }) => [
                  ...rootFeatures,
                  HeadingFeature({
                    enabledHeadingSizes: ["h1", "h2", "h3", "h4"],
                  }),
                  FixedToolbarFeature(),
                  InlineToolbarFeature(),
                  HorizontalRuleFeature(),
                ],
              }),
              label: false,
            },
          ],
        },
        {
          name: "meta",
          label: "SEO",
          fields: [
            OverviewField({
              titlePath: "meta.title",
              descriptionPath: "meta.description",
              imagePath: "meta.image",
            }),
            MetaTitleField({ hasGenerateFn: true }),
            MetaImageField({ relationTo: "media" }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: "meta.title",
              descriptionPath: "meta.description",
            }),
          ],
        },
        {
          name: "aiConcierge",
          label: "AI Concierge",
          fields: [
            {
              name: "enabled",
              type: "checkbox",
              defaultValue: true,
              label: "Enable AI Concierge on this page",
            },
            {
              name: "suggestions",
              type: "array",
              minRows: 0,
              label: "Suggestions for this page",
              labels: { singular: "Suggestion", plural: "Suggestions" },
              defaultValue: defaultPageConciergeSuggestions,
              fields: [
                {
                  name: "label",
                  type: "text",
                  required: true,
                  label: "Chip label",
                },
                {
                  name: "sampleMessage",
                  type: "text",
                  label: "Message sent (optional)",
                  admin: {
                    description:
                      "Sent to the concierge on click. Leave blank to send the label itself.",
                  },
                },
                {
                  name: "enabled",
                  type: "checkbox",
                  defaultValue: true,
                  label: "Show this suggestion",
                },
              ],
              admin: { initCollapsed: false },
            },
          ],
        },
      ],
    },
    {
      name: "publishedAt",
      type: "date",
      admin: { position: "sidebar" },
    },
    slugField(),
  ],
  hooks: {
    beforeChange: [populatePublishedAt],
    afterChange: [revalidateAfterChange],
    afterDelete: [revalidateAfterDelete],
  },
  versions: {
    drafts: { autosave: { interval: 800 } },
    maxPerDoc: 50,
  },
};
