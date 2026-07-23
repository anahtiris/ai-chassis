import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: { aiPromptConfig: { findUnique: vi.fn() } },
}));

import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/client";
import { getActivePrompt, invalidateActivePrompt } from "./promptRegistry";

describe("getActivePrompt", () => {
  beforeEach(() => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockReset();
  });

  it("returns null when no config exists for the key", async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue(null);

    const result = await getActivePrompt("missing-key");

    expect(result).toBeNull();
    expect(prisma.aiPromptConfig.findUnique).toHaveBeenCalledWith({
      where: { key: "missing-key" },
      include: { active_version: true },
    });
  });

  it("returns null when the config has no active version", async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue({
      id: "c1",
      key: "concierge-system-prompt",
      active_version_id: null,
      active_version: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    const result = await getActivePrompt("concierge-system-prompt");

    expect(result).toBeNull();
  });

  it("maps the active version fields when present", async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue({
      id: "c1",
      key: "concierge-system-prompt",
      active_version_id: "v2",
      active_version: {
        id: "v2",
        config_id: "c1",
        version: 2,
        prompt_text: "You are Acme Corp support.",
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 300,
        change_note: null,
        created_by: "admin@example.com",
        created_at: new Date(),
      },
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    const result = await getActivePrompt("concierge-system-prompt");

    expect(result).toEqual({
      prompt_text: "You are Acme Corp support.",
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 300,
      version: 2,
    });
  });
});

describe("invalidateActivePrompt", () => {
  it("revalidates the tag for the given key", () => {
    invalidateActivePrompt("concierge-system-prompt");

    expect(revalidateTag).toHaveBeenCalledWith(
      "ai_prompt_config:concierge-system-prompt",
      "max",
    );
  });
});
