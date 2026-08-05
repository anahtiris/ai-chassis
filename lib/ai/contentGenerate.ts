import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "./provider";
import { getActivePrompt } from "./promptRegistry";

// Reuses the same AiPromptConfig mechanism as the concierge
// (lib/ai/concierge.ts's CONCIERGE_PROMPT_KEY) — editable at
// /admin/ai/prompts without touching code, versioned, with the usual
// diff/rollback history. Create a config with this key there to override
// tone/style/model; unconfigured falls back to DEFAULT_SYSTEM_PROMPT below.
const CONTENT_GENERATOR_PROMPT_KEY = "content-generator-system-prompt";

const DEFAULT_SYSTEM_PROMPT =
  "You are a blog content writer for this website. Write clear, engaging draft posts. Do not fabricate specific facts, statistics, or claims you are not confident about — write generally instead.";

const draftSchema = z.object({
  title: z.string().describe("Blog post title, concise and engaging"),
  metaDescription: z
    .string()
    .describe(
      "SEO meta description summarizing the post, under 160 characters",
    ),
  sections: z
    .array(
      z.object({
        heading: z.string().describe("Section heading"),
        body: z.string().describe("Section body text, 2-4 sentences"),
      }),
    )
    .min(2)
    .max(8)
    .describe("The post's body, broken into headed sections"),
});

export type BlogDraft = z.infer<typeof draftSchema>;

// Always produces a draft for human review — see app/(app)/admin/(shell)/ai/content/page.tsx,
// which creates the Post with _status: "draft", never published directly.
export async function generateBlogDraft(topic: string): Promise<BlogDraft> {
  const promptConfig = await getActivePrompt(CONTENT_GENERATOR_PROMPT_KEY);

  const { object } = await generateObject({
    model: getModel(promptConfig?.model ?? undefined),
    schema: draftSchema,
    system: promptConfig?.prompt_text ?? DEFAULT_SYSTEM_PROMPT,
    prompt: `Write a blog post draft about: ${topic}`,
    temperature: promptConfig?.temperature ?? undefined,
  });

  return object;
}
