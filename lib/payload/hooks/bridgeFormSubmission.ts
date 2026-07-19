import type { CollectionAfterChangeHook } from 'payload'

// Bridges @payloadcms/plugin-form-builder's own `form-submissions` collection
// into this toolkit's existing Prisma `FormSubmission` model (`app.form_submissions`,
// already the backing store for /admin/form-results — see
// app/admin/(shell)/form-results/page.tsx). Without this, adopting
// form-builder would create a second, disconnected form-submission system:
// form-builder's own Payload collection, invisible to the admin page that
// already reads from Prisma. See docs/decisions.md "formBuilderPlugin: one
// submission store, not two" for the full reasoning.
//
// Deliberately generic — no per-form routing or business pipeline logic
// (contrast with payload-poc's `afterFormSubmissionCreate`, which matched a
// hardcoded form title and forwarded to Blackatz's own Contact Inquiry API).
// Every form-builder submission, from any form, lands in the same Prisma
// table as `form_key` = the form's title. `name`/`email` are populated only
// as a best-effort convenience, matching field names form-builder projects
// commonly use — not a contract this toolkit enforces on form authors.
export const bridgeFormSubmissionToPrisma: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req: { payload },
}) => {
  if (operation !== 'create') return doc

  try {
    // Lazy import rather than a static one: this file is imported by
    // payload.config.ts (via the formBuilderPlugin registration below), and
    // a static import of the Prisma client would be evaluated the moment
    // the config module loads — before Payload even needs a database
    // connection (config construction itself is pure, see docs/decisions.md
    // "Validating Payload config changes without a live database"). Loading
    // it only when a submission actually happens keeps config load decoupled
    // from Prisma client generation being available.
    const { prisma } = await import('@/lib/db/client')

    const formId = typeof doc.form === 'object' ? doc.form?.id : doc.form
    if (!formId) return doc

    const form = await payload.findByID({ collection: 'forms', id: formId, depth: 0 })
    const formKey = typeof form?.title === 'string' && form.title.trim() ? form.title : String(formId)

    const submissionData = Array.isArray(doc.submissionData) ? doc.submissionData : []
    const values: Record<string, unknown> = {}
    for (const entry of submissionData) {
      if (entry && typeof entry === 'object' && 'field' in entry) {
        values[String((entry as { field: unknown }).field)] = (entry as { value: unknown }).value
      }
    }

    const name = typeof values.name === 'string' ? values.name : undefined
    const email = typeof values.email === 'string' ? values.email : undefined

    await prisma.formSubmission.create({
      data: {
        form_key: formKey,
        name,
        email,
        payload: submissionData,
        source: 'PayloadFormBuilder',
      },
    })
  } catch (err) {
    payload.logger.error(err, 'bridgeFormSubmissionToPrisma: failed to write FormSubmission row')
  }

  return doc
}
