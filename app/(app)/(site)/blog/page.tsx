import Link from "next/link";
import { getPayloadClient } from "@/lib/payload/client";

// Simple public index of published blog Posts. Links to /blog/<slug>.
export default async function BlogIndexPage() {
  const payload = await getPayloadClient();
  const posts = await payload.find({
    collection: "posts",
    where: { _status: { equals: "published" } },
    sort: "-publishedAt",
    limit: 50,
    overrideAccess: false,
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-semibold">Blog</h1>
      {posts.docs.length === 0 ? (
        <p className="text-muted-foreground">No posts yet.</p>
      ) : (
        <ul className="space-y-4">
          {posts.docs.map((post) => (
            <li key={post.id}>
              <Link
                href={`/blog/${post.slug}`}
                className="text-primary text-lg underline-offset-4 hover:underline"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
