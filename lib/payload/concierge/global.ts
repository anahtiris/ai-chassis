import type { GlobalConfig } from "payload";
import { revalidateAiConcierge } from "./hooks";

// Site-wide defaults for the AI concierge widget's suggestion chips.
// Per-collection `aiConcierge.suggestions` fields (see collections/pages.ts,
// collections/posts.ts) seed from this on document creation
// (defaultPageSuggestions.ts) and can then override it independently per page.
//
// A suggestion is `{ label, sampleMessage }`, matching generative-ui-kit's
// `Suggestion` type so the resolved list feeds the chat widget directly:
// `label` is the chip text the user sees, `sampleMessage` is what actually
// gets sent to the concierge on click (falls back to `label` when blank).
// This split is the flexibility a single `question` string couldn't give —
// e.g. a short chip "Pricing" that sends "How much does the pro plan cost?".
export const AiConcierge: GlobalConfig = {
  slug: "aiConcierge",
  access: {
    read: () => true,
  },
  fields: [
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
      label: "Enable AI Concierge site-wide",
    },
    {
      name: "suggestions",
      type: "array",
      minRows: 0,
      labels: { singular: "Suggestion", plural: "Suggestions" },
      fields: [
        { name: "label", type: "text", required: true, label: "Chip label" },
        {
          name: "sampleMessage",
          type: "text",
          label: "Message sent (optional)",
          admin: {
            description:
              "What gets sent to the concierge when this chip is clicked. Leave blank to send the label itself.",
          },
        },
      ],
      defaultValue: [
        { label: "What can you help me with?" },
        { label: "How do I get started?" },
      ],
      admin: {
        initCollapsed: true,
      },
    },
  ],
  hooks: {
    afterChange: [revalidateAiConcierge],
  },
};
