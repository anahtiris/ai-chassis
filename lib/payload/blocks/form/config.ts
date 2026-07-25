import type { Block } from "payload";
import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";

// Generic layout block: attach a form-builder form, with an optional intro.
// Ported from payload-poc's blocks/Form config (the renderer differs — see
// Component.tsx, which wraps this repo's existing PayloadForm instead of
// duplicating payload-poc's own submit logic).
export const FormBlock: Block = {
  slug: "formBlock",
  interfaceName: "FormBlock",
  fields: [
    {
      name: "form",
      type: "relationship",
      relationTo: "forms",
      required: true,
    },
    {
      name: "enableIntro",
      type: "checkbox",
      label: "Enable Intro Content",
    },
    {
      name: "introContent",
      type: "richText",
      admin: {
        condition: (_, { enableIntro }) => Boolean(enableIntro),
      },
      editor: lexicalEditor({
        features: ({ rootFeatures }) => [
          ...rootFeatures,
          HeadingFeature({ enabledHeadingSizes: ["h1", "h2", "h3", "h4"] }),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ],
      }),
      label: "Intro Content",
    },
  ],
  labels: {
    plural: "Form Blocks",
    singular: "Form Block",
  },
};
