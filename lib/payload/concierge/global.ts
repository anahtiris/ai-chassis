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
    // Read at request time by lib/ai/memory/settings.ts. Env vars
    // (CHAT_MEMORY_*) act as fallbacks when a field here is unset, so a
    // fresh fork boots before anyone opens this page — see
    // docs/decisions.md's memory entry for the precedence rules.
    {
      name: "memory",
      type: "group",
      label: "Conversation memory",
      admin: {
        description:
          "How much of the conversation the concierge remembers. 'None' reproduces the original stateless behavior.",
      },
      fields: [
        {
          name: "strategy",
          type: "select",
          defaultValue: "none",
          options: [
            { label: "None — only the current message", value: "none" },
            { label: "Window — the most recent messages", value: "window" },
            {
              label: "Summary — roll older messages into a summary",
              value: "summary",
            },
          ],
        },
        {
          name: "keepRecentTurns",
          type: "number",
          defaultValue: 10,
          label: "Messages kept verbatim",
          min: 1,
        },
        {
          name: "maxHistoryChars",
          type: "number",
          defaultValue: 8000,
          label: "History character budget",
          min: 500,
          admin: {
            description:
              "Approximate context budget, counted in characters (roughly four characters per token).",
          },
        },
      ],
    },
  ],
  hooks: {
    afterChange: [revalidateAiConcierge],
  },
};
