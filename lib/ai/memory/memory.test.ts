import { describe, expect, it } from "vitest";

import { parseStoredHistory } from "./parse";
import { getMemoryStrategy } from "./provider";
import { NoneStrategy, WindowStrategy } from "./strategies";
import type { MemorySettings, StoredHistory } from "./types";

function history(overrides: Partial<StoredHistory> = {}): StoredHistory {
  return {
    turns: [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
      { role: "assistant", content: "four" },
    ],
    summary: null,
    summaryTurns: 0,
    ...overrides,
  };
}

function settings(overrides: Partial<MemorySettings> = {}): MemorySettings {
  return {
    strategy: "window",
    maxHistoryChars: 8000,
    keepRecentTurns: 10,
    ...overrides,
  };
}

describe("parseStoredHistory", () => {
  it("reads well-formed user and assistant messages", () => {
    const parsed = parseStoredHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(parsed.turns).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  // appendToConversation writes tool calls as
  // { role: "assistant", toolCall: {...} } with no `content` — there is no
  // text to replay, so these are dropped rather than sent as empty strings.
  it("drops assistant tool-call entries that carry no content", () => {
    const parsed = parseStoredHistory([
      { role: "user", content: "chart it" },
      { role: "assistant", toolCall: { id: "1", name: "table", input: {} } },
    ]);
    expect(parsed.turns).toEqual([{ role: "user", content: "chart it" }]);
  });

  it("returns an empty history for anything it cannot read", () => {
    expect(parseStoredHistory(null).turns).toEqual([]);
    expect(parseStoredHistory("nonsense").turns).toEqual([]);
    expect(
      parseStoredHistory([{ role: "system", content: "x" }]).turns,
    ).toEqual([]);
  });

  it("defaults summary fields when absent", () => {
    const parsed = parseStoredHistory([]);
    expect(parsed.summary).toBeNull();
    expect(parsed.summaryTurns).toBe(0);
  });

  it("carries through the summary fields it is given", () => {
    const parsed = parseStoredHistory([], "EARLIER", 4);
    expect(parsed.summary).toBe("EARLIER");
    expect(parsed.summaryTurns).toBe(4);
  });
});

describe("NoneStrategy", () => {
  it("sends no history at all", () => {
    expect(new NoneStrategy().prepare(history())).toEqual({
      summary: null,
      turns: [],
    });
  });

  it("never compacts", async () => {
    await expect(new NoneStrategy().compact(history())).resolves.toBeNull();
  });
});

describe("WindowStrategy", () => {
  it("sends only the most recent turns", () => {
    expect(new WindowStrategy(2).prepare(history())).toEqual({
      summary: null,
      turns: [
        { role: "user", content: "three" },
        { role: "assistant", content: "four" },
      ],
    });
  });

  it("sends everything when the history is shorter than the window", () => {
    expect(new WindowStrategy(50).prepare(history()).turns).toHaveLength(4);
  });

  it("never compacts — it narrows what is sent, it does not rewrite storage", async () => {
    await expect(new WindowStrategy(2).compact(history())).resolves.toBeNull();
  });
});

describe("getMemoryStrategy", () => {
  it("returns the window strategy when configured", () => {
    expect(getMemoryStrategy(settings())).toBeInstanceOf(WindowStrategy);
  });

  it("returns the none strategy when configured", () => {
    expect(getMemoryStrategy(settings({ strategy: "none" }))).toBeInstanceOf(
      NoneStrategy,
    );
  });

  it("falls back to none for an unrecognized strategy", () => {
    const bad = {
      ...settings(),
      strategy: "banana",
    } as unknown as MemorySettings;
    expect(getMemoryStrategy(bad)).toBeInstanceOf(NoneStrategy);
  });
});
