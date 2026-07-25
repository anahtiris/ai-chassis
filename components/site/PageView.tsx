import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { getPayloadClient } from "@/lib/payload/client";
import {
  resolveConciergeSuggestions,
  isConciergeEnabled,
} from "@/lib/payload/concierge/resolveSuggestions";
import { ConciergeWidget } from "@/components/concierge/ConciergeWidget";
import { RenderBlocks } from "@/lib/payload/blocks/RenderBlocks";
import { LivePreviewListener } from "@/components/site/LivePreviewListener";

// Shared renderer for a CMS Page, used by both the site root (/, slug "/")
// and the /<slug> catch-all. Published-only, and 404s on an unpublished
// page, UNLESS Next.js Draft Mode is active (set by app/api/preview/route.ts
// from admin.livePreview/preview — see lib/payload/collections/pages.ts),
// in which case it fetches the latest draft instead and renders
// LivePreviewListener so /admin/cms's editor auto-refreshes it on save.
// Shows the floating ConciergeWidget when the page's AI Concierge is
// enabled (page override falling back to the global), fed the page's resolved
// { label, sampleMessage } suggestions.
export async function PageView({ slug }: { slug: string }) {
  const { isEnabled: draft } = await draftMode();
  const payload = await getPayloadClient();

  const [pages, global] = await Promise.all([
    payload.find({
      collection: "pages",
      where: draft
        ? { slug: { equals: slug } }
        : { slug: { equals: slug }, _status: { equals: "published" } },
      draft,
      limit: 1,
      overrideAccess: draft,
    }),
    payload.findGlobal({ slug: "aiConcierge" }),
  ]);

  const page = pages.docs[0];
  if (!page) notFound();

  const suggestions = resolveConciergeSuggestions(
    global?.suggestions,
    page.aiConcierge,
  );
  const conciergeOn = isConciergeEnabled(global?.enabled, page.aiConcierge);

  return (
    <main className="py-10 [&_a]:text-primary [&_a]:underline [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-medium [&_p]:my-3 [&_p]:leading-relaxed">
      <RenderBlocks blocks={page.layout} />
      {conciergeOn && <ConciergeWidget suggestions={suggestions} />}
      {draft && <LivePreviewListener />}
    </main>
  );
}
