import { generateText } from "ai";
import type {
  GenerateDescription,
  GenerateTitle,
} from "@payloadcms/plugin-seo/types";
import { getModel } from "./provider";
import { lexicalToPlainText } from "@/lib/payload/lexicalToPlainText";
import type { Page, Post } from "@/payload-types";

const MAX_BODY_CHARS = 4000;

// Pages carry body prose in `layout` blocks (only the `content` block type
// has any — see payload.config.ts's pagesToKnowledgePool, which walks the
// same shape for RAG). Posts use a flat `content` richText field instead
// (see posts.ts). Best-effort: returns "" if neither shape matches.
function extractBodyText(doc: Partial<Page> | Partial<Post>): string {
  if ("content" in doc && doc.content && typeof doc.content === "object") {
    return lexicalToPlainText((doc.content as { root?: unknown }).root).trim();
  }

  const layout = "layout" in doc && Array.isArray(doc.layout) ? doc.layout : [];
  const parts: string[] = [];
  for (const block of layout) {
    if (
      !block ||
      typeof block !== "object" ||
      (block as { blockType?: unknown }).blockType !== "content"
    ) {
      continue;
    }
    const columns = Array.isArray((block as { columns?: unknown }).columns)
      ? ((block as { columns: unknown[] }).columns as Array<{
          richText?: { root?: unknown };
        }>)
      : [];
    for (const column of columns) {
      const text = lexicalToPlainText(column.richText?.root).trim();
      if (text) parts.push(text);
    }
  }
  return parts.join("\n\n");
}

// Backs the "Generate" button on Pages/Posts' Meta Title field
// (MetaTitleField's hasGenerateFn, in lib/payload/collections/{pages,posts}.ts).
// Falls back to the raw page title on any provider error so a misconfigured
// AI_PROVIDER degrades to "no-op" rather than a broken button.
export const generateSeoTitle: GenerateTitle<Page | Post> = async ({ doc }) => {
  const title = typeof doc?.title === "string" ? doc.title : "";
  if (!title) return "";

  const body = extractBodyText(doc ?? {}).slice(0, MAX_BODY_CHARS);

  try {
    const { text } = await generateText({
      model: getModel(),
      system:
        "You write concise SEO meta titles. Reply with only the title text itself — no quotes, no explanation, under 60 characters.",
      prompt: `Page title: ${title}\n\nBody content:\n${body || "(no body content yet)"}`,
    });
    return text.trim();
  } catch (error) {
    console.warn(
      "[seo] title generation failed, falling back to page title:",
      error,
    );
    return title;
  }
};

// Backs the "Generate" button on Pages/Posts' Meta Description field
// (MetaDescriptionField's hasGenerateFn). Returns "" (rather than throwing)
// when there's no body content yet or the provider call fails, matching
// Payload's own generateDescription examples.
export const generateSeoDescription: GenerateDescription<Page | Post> = async ({
  doc,
}) => {
  const title = typeof doc?.title === "string" ? doc.title : "";
  const body = extractBodyText(doc ?? {}).slice(0, MAX_BODY_CHARS);
  if (!body) return "";

  try {
    const { text } = await generateText({
      model: getModel(),
      system:
        "You write concise SEO meta descriptions. Reply with only the description text itself — no quotes, no explanation, under 160 characters.",
      prompt: `Page title: ${title}\n\nBody content:\n${body}`,
    });
    return text.trim();
  } catch (error) {
    console.warn("[seo] description generation failed:", error);
    return "";
  }
};
