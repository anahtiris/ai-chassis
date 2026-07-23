import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/client";

export interface ActivePromptConfig {
  prompt_text: string;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  version: number;
}

function cacheTagForKey(key: string): string {
  return `ai_prompt_config:${key}`;
}

async function loadActivePrompt(
  key: string,
): Promise<ActivePromptConfig | null> {
  const config = await prisma.aiPromptConfig.findUnique({
    where: { key },
    include: { active_version: true },
  });
  if (!config?.active_version) return null;

  const { prompt_text, model, temperature, max_tokens, version } =
    config.active_version;
  return { prompt_text, model, temperature, max_tokens, version };
}

// Cached per key — next.config.ts doesn't enable experimental.cacheComponents,
// so the 'use cache' directive isn't available here. unstable_cache + tags
// is this toolkit's established mechanism for "cache that must invalidate
// immediately on save" (see lib/payload/concierge/hooks.ts's
// revalidateTag('global_aiConcierge', 'max') and
// lib/payload/hooks/revalidateCollection.ts's matching comment about
// unstable_cache's tags option).
export async function getActivePrompt(
  key: string,
): Promise<ActivePromptConfig | null> {
  return unstable_cache(
    () => loadActivePrompt(key),
    ["ai-prompt-config", key],
    {
      tags: [cacheTagForKey(key)],
    },
  )();
}

// Called by the Server Actions in app/(app)/admin/(shell)/ai/prompts/** after any
// write that changes which version is active for `key` — a new version
// created, or an existing one activated/rolled back to.
export function invalidateActivePrompt(key: string): void {
  revalidateTag(cacheTagForKey(key), "max");
}
