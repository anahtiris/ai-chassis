import type { CollectionAfterChangeHook } from "payload";

// Lightweight social cross-posting: on publish, POST a JSON payload to
// SOCIAL_PUBLISH_WEBHOOK_URL and let an external automation tool (Zapier,
// Make, n8n) fan it out to actual platforms — no per-platform OAuth/token
// storage in this app. Unset (default): no-op. See README "Social webhook
// (opt-in)".
//
// Fires only on the draft/unpublished -> published transition, not on
// every subsequent edit of an already-published doc, so republishing a
// typo fix doesn't re-post. Skips during seeding via the same
// context.disableRevalidate flag createRevalidateHooks respects (see
// scripts/seed-content.ts).
//
// The POST is awaited inside afterChange, so it's bounded by a timeout: an
// unresponsive webhook host would otherwise hold the editor's Publish
// request open until undici's 300s default. On timeout the fetch rejects
// into the catch below, the warning is logged, and the save completes.
const WEBHOOK_TIMEOUT_MS = 5000;

export function createSocialPublishHook(
  collectionSlug: "pages" | "posts",
): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, req: { payload, context } }) => {
    const webhookUrl = process.env.SOCIAL_PUBLISH_WEBHOOK_URL;
    if (!webhookUrl || context.disableRevalidate) return doc;

    const justPublished =
      doc._status === "published" && previousDoc?._status !== "published";
    if (!justPublished) return doc;

    const base = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
    // Matches this toolkit's actual public routes (see
    // lib/payload/generatePreviewPath.ts, the other place this exact
    // pages-vs-posts routing shape is encoded): posts at "/blog/<slug>",
    // pages at "/<slug>" (or "/" for the root page's slug "/" itself).
    const path =
      collectionSlug === "posts"
        ? `/blog/${doc.slug}`
        : doc.slug === "/"
          ? "/"
          : `/${doc.slug}`;

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection: collectionSlug,
          id: doc.id,
          title: doc.title,
          url: `${base}${path}`,
          excerpt: doc.meta?.description ?? null,
          imageId: doc.meta?.image ?? null,
          publishedAt: doc.publishedAt ?? null,
        }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (!res.ok) {
        payload.logger.warn(
          `Social publish webhook responded ${res.status} for ${collectionSlug}/${doc.id}`,
        );
      }
    } catch (error) {
      payload.logger.warn(
        `Social publish webhook failed for ${collectionSlug}/${doc.id}: ${error}`,
      );
    }

    return doc;
  };
}
