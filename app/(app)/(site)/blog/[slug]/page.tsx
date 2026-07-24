import { notFound } from "next/navigation";
import { RichText } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { getPayloadClient } from "@/lib/payload/client";
import {
  resolveConciergeSuggestions,
  isConciergeEnabled,
} from "@/lib/payload/concierge/resolveSuggestions";
import { ConciergeWidget } from "@/components/concierge/ConciergeWidget";

// Renders a published blog Post at /blog/<slug>. Same concierge behaviour as
// content pages: the widget shows when the post's AI Concierge is enabled.
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await getPayloadClient();

  const [posts, global] = await Promise.all([
    payload.find({
      collection: "posts",
      where: { slug: { equals: slug }, _status: { equals: "published" } },
      limit: 1,
      overrideAccess: false,
    }),
    payload.findGlobal({ slug: "aiConcierge" }),
  ]);

  const post = posts.docs[0];
  if (!post) notFound();

  const suggestions = resolveConciergeSuggestions(
    global?.suggestions,
    post.aiConcierge,
  );
  const conciergeOn = isConciergeEnabled(global?.enabled, post.aiConcierge);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-4 text-3xl font-semibold">{post.title}</h1>
      <article className="[&_a]:text-primary [&_a]:underline [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-medium [&_p]:my-3 [&_p]:leading-relaxed">
        {post.content && (
          <RichText data={post.content as SerializedEditorState} />
        )}
      </article>
      {conciergeOn && <ConciergeWidget suggestions={suggestions} />}
    </main>
  );
}
