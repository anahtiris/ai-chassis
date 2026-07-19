import type { DefaultValue } from 'payload'

/**
 * Seeds a new page/post's `aiConcierge.questions` array with the global's
 * current default questions, all checked. Payload only runs this when the
 * field is `undefined`, so it only applies to brand-new documents — once
 * saved, the copy is independent of the global list and other pages.
 */
export const defaultPageConciergeQuestions: DefaultValue = async ({ req }) => {
  const global = await req.payload.findGlobal({ slug: 'aiConcierge' })
  return (global?.questions ?? []).map((q) => ({ question: q.question, enabled: true }))
}
