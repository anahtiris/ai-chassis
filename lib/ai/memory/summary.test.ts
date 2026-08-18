import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ getModel: vi.fn(() => "test-model") }));
vi.mock("@/lib/ai/promptRegistry", () => ({
  getActivePrompt: vi.fn(async () => null),
}));

import { generateText } from "ai";
import { SummaryStrategy } from "./summary";
import type { MemorySettings, StoredHistory } from "./types";

function settings(overrides: Partial<MemorySettings> = {}): MemorySettings {
  return {
    strategy: "summary",
    maxHistoryChars: 8000,
    keepRecentTurns: 10,
    ...overrides,
  };
}

// Each turn is 200 characters, so budgets below are easy to reason about.
function longHistory(count: number): StoredHistory {
  return {
    turns: Array.from({ length: count }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: "x".repeat(200),
    })),
    summary: null,
    summaryTurns: 0,
  };
}

beforeEach(() => {
  vi.mocked(generateText).mockReset();
  vi.mocked(generateText).mockResolvedValue({
    text: "SUMMARY",
  } as unknown as Awaited<ReturnType<typeof generateText>>);
});

describe("SummaryStrategy.prepare", () => {
  it("sends only the turns after the summarized ones, plus the summary", () => {
    const prepared = new SummaryStrategy(settings()).prepare({
      turns: [
        { role: "user", content: "old" },
        { role: "assistant", content: "older" },
        { role: "user", content: "recent" },
      ],
      summary: "EARLIER",
      summaryTurns: 2,
    });
    expect(prepared.summary).toBe("EARLIER");
    expect(prepared.turns).toEqual([{ role: "user", content: "recent" }]);
  });

  it("performs no model call", () => {
    new SummaryStrategy(settings()).prepare(longHistory(4));
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("SummaryStrategy.compact", () => {
  it("does nothing while the history is under budget", async () => {
    const strategy = new SummaryStrategy(
      settings({ maxHistoryChars: 8000, keepRecentTurns: 4 }),
    );
    await expect(strategy.compact(longHistory(2))).resolves.toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("summarizes the oldest turns once the budget is exceeded", async () => {
    const strategy = new SummaryStrategy(
      settings({ maxHistoryChars: 1000, keepRecentTurns: 2 }),
    );
    const result = await strategy.compact(longHistory(10));
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result?.summary).toBe("SUMMARY");
    // 10 turns, 2 kept verbatim -> 8 folded in.
    expect(result?.summaryTurns).toBe(8);
  });

  it("does not re-summarize turns already folded in", async () => {
    // Budget 500, not 1000: with 6 of 10 turns already folded in, only 4
    // live turns remain (800 chars). A 1000-char budget would return null
    // before reaching the model call this test asserts on.
    const strategy = new SummaryStrategy(
      settings({ maxHistoryChars: 500, keepRecentTurns: 2 }),
    );
    const result = await strategy.compact({
      ...longHistory(10),
      summary: "EARLIER",
      summaryTurns: 6,
    });
    const prompt = vi.mocked(generateText).mock.calls[0][0].prompt as string;
    expect(prompt).toContain("EARLIER");
    expect(result?.summaryTurns).toBe(8);
  });

  it("returns null when nothing is left to fold after keeping recent turns", async () => {
    const strategy = new SummaryStrategy(
      settings({ maxHistoryChars: 100, keepRecentTurns: 10 }),
    );
    await expect(strategy.compact(longHistory(4))).resolves.toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns null when the model call fails, leaving history untouched", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("provider down"));
    const strategy = new SummaryStrategy(
      settings({ maxHistoryChars: 1000, keepRecentTurns: 2 }),
    );
    await expect(strategy.compact(longHistory(10))).resolves.toBeNull();
  });
});
