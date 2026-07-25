import type { CollectionAfterChangeHook } from "payload";

// Bridges @payloadcms/plugin-form-builder's own `form-submissions` collection
// into this toolkit's existing Prisma `FormSubmission` model (`app.form_submissions`,
// already the backing store for /admin/form-results — see
// app/(app)/admin/(shell)/form-results/page.tsx). Without this, adopting
// form-builder would create a second, disconnected form-submission system:
// form-builder's own Payload collection, invisible to the admin page that
// already reads from Prisma. See docs/decisions.md "formBuilderPlugin: one
// submission store, not two" for the full reasoning.
//
// Deliberately generic — no per-form routing or business pipeline logic
// (contrast with payload-poc's `afterFormSubmissionCreate`, which matched a
// hardcoded form title and forwarded to Blackatz's own Contact Inquiry API).
// Every form-builder submission, from any form, lands in the same Prisma
// table as `form_key` = the form's title. `payload` (the raw field/value
// pairs) is the only source of truth — no denormalized name/email columns,
// since form-builder forms are arbitrary and not every form collects either.
// See docs/decisions.md "FormSubmission: drop denormalized name/email columns".
export const bridgeFormSubmissionToPrisma: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req: { payload },
}) => {
  if (operation !== "create") return doc;

  try {
    // Lazy import rather than a static one: this file is imported by
    // payload.config.ts (via the formBuilderPlugin registration below), and
    // a static import of the Prisma client would be evaluated the moment
    // the config module loads — before Payload even needs a database
    // connection (config construction itself is pure, see docs/decisions.md
    // "Validating Payload config changes without a live database"). Loading
    // it only when a submission actually happens keeps config load decoupled
    // from Prisma client generation being available.
    const { prisma } = await import("@/lib/db/client");

    const formId = typeof doc.form === "object" ? doc.form?.id : doc.form;
    if (!formId) return doc;

    const form = await payload.findByID({
      collection: "forms",
      id: formId,
      depth: 0,
    });
    const formKey =
      typeof form?.title === "string" && form.title.trim()
        ? form.title
        : String(formId);

    const submissionData = Array.isArray(doc.submissionData)
      ? doc.submissionData
      : [];

    await prisma.formSubmission.create({
      data: {
        form_key: formKey,
        payload: submissionData,
        source: "PayloadFormBuilder",
      },
    });
  } catch (err) {
    payload.logger.error(
      err,
      "bridgeFormSubmissionToPrisma: failed to write FormSubmission row",
    );
  }

  return doc;
};
