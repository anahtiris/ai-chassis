import type { CollectionConfig } from "payload";
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
import { Content } from "../blocks/content/config";
import { MediaBlock } from "../blocks/media/config";
import { FormBlock } from "../blocks/form/config";

// Generic CMS page: title + a `layout` blocks field, versioned drafts, SEO
// fields, and an AI Concierge question override. `layout` ships three
// generic, structural blocks (content/mediaBlock/formBlock) ported from
// payload-poc — business-specific blocks (LandingHero, IndustriesGrid, etc.)
// stay excluded, per docs/decisions.md "Collections: generic infrastructure
// only, no page-builder blocks". Field names (title/slug/layout) are
// load-bearing: payload.config.ts's RAG knowledge-pool feed and
// lib/knowledge/provider.ts's DirectInjectionProvider both walk `layout`
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
              name: "layout",
              type: "blocks",
              blocks: [Content, MediaBlock, FormBlock],
              required: true,
              admin: { initCollapsed: true },
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
