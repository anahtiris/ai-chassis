// Builds the /api/preview URL for a doc's admin.livePreview.url and
// admin.preview config (see lib/payload/collections/pages.ts and posts.ts).
// Matches this toolkit's actual public routes (see
// app/(app)/(site)/*): pages render at "/<slug>" (root page's slug is "/"
// itself — see components/site/PageView.tsx), posts at "/blog/<slug>". No
// payload-poc-style category-prefixed URL structure — this toolkit doesn't
// have an opinion on post routing beyond the one flat /blog it ships.
export function generatePreviewPath({
  collection,
  slug,
}: {
  collection: "pages" | "posts";
  slug: string;
}): string | null {
  if (!slug) return null;

  const path =
    collection === "posts"
      ? `/blog/${encodeURIComponent(slug)}`
      : slug === "/"
        ? "/"
        : `/${encodeURIComponent(slug)}`;

  const params = new URLSearchParams({
    path,
    secret: process.env.PREVIEW_SECRET ?? "",
  });

  return `/api/preview?${params.toString()}`;
}
