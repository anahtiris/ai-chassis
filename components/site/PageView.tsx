import { notFound } from "next/navigation";
import { RichText } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import type { Form as FormType } from "@payloadcms/plugin-form-builder/types";
import { getPayloadClient } from "@/lib/payload/client";
import {
  resolveConciergeSuggestions,
  isConciergeEnabled,
} from "@/lib/payload/concierge/resolveSuggestions";
import { ConciergeWidget } from "@/components/concierge/ConciergeWidget";
import { PayloadForm } from "@/components/site/Form/PayloadForm";

// Shared renderer for a published CMS Page, used by both the site root (/,
// slug "home") and the /<slug> catch-all. Draft/unpublished pages 404 for the
// public. Shows the floating ConciergeWidget when the page's AI Concierge is
// enabled (page override falling back to the global), fed the page's resolved
// { label, sampleMessage } suggestions.
export async function PageView({ slug }: { slug: string }) {
  const payload = await getPayloadClient();

  const [pages, global] = await Promise.all([
    payload.find({
      collection: "pages",
      where: { slug: { equals: slug }, _status: { equals: "published" } },
      limit: 1,
      overrideAccess: false,
    }),
    payload.findGlobal({ slug: "aiConcierge" }),
  ]);

  const page = pages.docs[0];
  if (!page) notFound();

  const formRef = page.form;
  const formDoc =
    formRef != null
      ? await payload
          .findByID({
            collection: "forms",
            id: typeof formRef === "object" ? formRef.id : formRef,
            overrideAccess: false,
          })
          .catch(() => null)
      : null;

  const suggestions = resolveConciergeSuggestions(
    global?.suggestions,
    page.aiConcierge,
  );
  const conciergeOn = isConciergeEnabled(global?.enabled, page.aiConcierge);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <article className="[&_a]:text-primary [&_a]:underline [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-medium [&_p]:my-3 [&_p]:leading-relaxed">
        {page.content && (
          <RichText data={page.content as SerializedEditorState} />
        )}
      </article>
      {formDoc && <PayloadForm form={formDoc as unknown as FormType} />}
      {conciergeOn && <ConciergeWidget suggestions={suggestions} />}
    </main>
  );
}
