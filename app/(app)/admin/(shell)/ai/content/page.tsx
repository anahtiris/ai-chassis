import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/auth/permissions";
import { generateBlogDraft } from "@/lib/ai/contentGenerate";
import { getPayloadClient } from "@/lib/payload/client";
import { heading, paragraph, richText } from "@/lib/payload/lexicalBuilders";
import type { Post } from "@/payload-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const SELECT_CLASSNAME =
  "border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm";

// Gated by AI_MANAGEMENT, same permission as /admin/ai/prompts and
// /admin/ai/conversations — generating draft content is an AI-management
// capability, not a distinct one. Always creates a draft Post
// (_status: "draft") for human review in Payload's own editor — never
// publishes directly. See lib/ai/contentGenerate.ts for the generation
// call and lib/payload/lexicalBuilders.ts for the Lexical JSON it's
// converted into.
export default async function AiContentPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const allowed = await hasPermission(session.user.id, "AI_MANAGEMENT");
  if (!allowed) redirect("/admin");

  const payload = await getPayloadClient();
  const { docs: categories } = await payload.find({
    collection: "categories",
    limit: 100,
    depth: 0,
    sort: "title",
  });

  async function generateDraft(formData: FormData) {
    "use server";
    const actingSession = await auth();
    if (!actingSession?.user) throw new Error("Not authorized");
    const ok = await hasPermission(actingSession.user.id, "AI_MANAGEMENT");
    if (!ok) throw new Error("Not authorized");

    const topicRaw = formData.get("topic");
    if (typeof topicRaw !== "string" || !topicRaw.trim()) return;
    const topic = topicRaw.trim();

    const categoryIdRaw = formData.get("categoryId");
    const categoryId =
      typeof categoryIdRaw === "string" && categoryIdRaw.trim() !== ""
        ? Number(categoryIdRaw)
        : undefined;

    const draft = await generateBlogDraft(topic);

    const content = richText(
      ...draft.sections.flatMap((section) => [
        heading(section.heading, "h2"),
        paragraph(section.body),
      ]),
    ) as unknown as NonNullable<Post["content"]>;

    const payloadClient = await getPayloadClient();
    const created = await payloadClient.create({
      collection: "posts",
      data: {
        title: draft.title,
        content,
        meta: { description: draft.metaDescription },
        categories: categoryId ? [categoryId] : undefined,
        // No `authors` set — Payload's own `users` collection is a
        // separate ID space from Auth.js's session user (see posts.ts's
        // populateAuthors comment); there's no reliable id to map here.
        // Attribution stays whatever an editor sets manually before
        // publishing.
        _status: "draft",
      },
      draft: true,
      overrideAccess: true,
    });

    redirect(`/admin/cms/collections/posts/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Generate a draft post</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={generateDraft} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                name="topic"
                placeholder="What should the post be about?"
                required
              />
            </div>
            {categories.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="categoryId">Category (optional)</Label>
                <select
                  id="categoryId"
                  name="categoryId"
                  defaultValue=""
                  className={SELECT_CLASSNAME}
                >
                  <option value="">No category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Creates a draft for review in the CMS — nothing is published
              automatically. Uses the
              &quot;content-generator-system-prompt&quot; AiPromptConfig if one
              exists (edit tone/style at{" "}
              <span className="font-mono">/admin/ai/prompts</span>), otherwise a
              generic default.
            </p>
            <Button type="submit" size="sm" className="self-start">
              Generate draft
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
