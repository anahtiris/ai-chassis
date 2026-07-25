import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payload/client", () => ({
  getPayloadClient: vi.fn(),
}));

import { getPayloadClient } from "@/lib/payload/client";
import { getKnowledgeProvider } from "./provider";

describe("DirectInjectionProvider (getKnowledgeProvider with RAG_ENABLED unset)", () => {
  beforeEach(() => {
    vi.mocked(getPayloadClient).mockReset();
    delete process.env.RAG_ENABLED;
  });

  it("returns a title chunk and a body chunk per published page", async () => {
    vi.mocked(getPayloadClient).mockResolvedValue({
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            id: 1,
            title: "About Us",
            slug: "about",
            layout: [
              {
                blockType: "content",
                columns: [
                  {
                    richText: {
                      root: {
                        children: [
                          { children: [{ text: "We build things." }] },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    } as any);

    const provider = getKnowledgeProvider();
    const chunks = await provider.getRelevantKnowledge("anything");

    expect(chunks).toEqual([
      { content: "About Us", source: "pages", sourceUrl: "/about" },
      { content: "We build things.", source: "pages", sourceUrl: "/about" },
    ]);
  });

  it("queries only published pages", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    vi.mocked(getPayloadClient).mockResolvedValue({ find } as any);

    const provider = getKnowledgeProvider();
    await provider.getRelevantKnowledge("anything");

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "pages",
        where: { _status: { equals: "published" } },
      }),
    );
  });

  it("skips a page with an empty title and empty content", async () => {
    vi.mocked(getPayloadClient).mockResolvedValue({
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 2, title: "", slug: "empty", layout: [] }],
      }),
    } as any);

    const provider = getKnowledgeProvider();
    const chunks = await provider.getRelevantKnowledge("anything");

    expect(chunks).toEqual([]);
  });
});
