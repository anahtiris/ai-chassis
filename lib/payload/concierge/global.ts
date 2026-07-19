import type { GlobalConfig } from 'payload'
import { revalidateAiConcierge } from './hooks'

// Site-wide defaults for the AI concierge widget's suggested-question chips.
// Per-collection `aiConcierge.questions` fields (see collections/pages.ts,
// collections/posts.ts) seed from this on document creation
// (defaultPageQuestions.ts) and can then override it independently per page.
// Ported from payload-poc's AiConcierge global, de-branded — the mechanism
// (global defaults + per-document override array) is generic; the original
// project's wellness-specific default questions are not.
export const AiConcierge: GlobalConfig = {
  slug: 'aiConcierge',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Enable AI Concierge site-wide',
    },
    {
      name: 'questions',
      type: 'array',
      minRows: 0,
      fields: [{ name: 'question', type: 'text', required: true }],
      defaultValue: [
        { question: 'What can you help me with?' },
        { question: 'How do I get started?' },
      ],
      admin: {
        initCollapsed: true,
      },
    },
  ],
  hooks: {
    afterChange: [revalidateAiConcierge],
  },
}
