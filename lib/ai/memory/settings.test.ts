import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveMemorySettings } from "./settings";

const ENV_KEYS = [
  "CHAT_MEMORY_STRATEGY",
  "CHAT_MEMORY_MAX_CHARS",
  "CHAT_MEMORY_KEEP_TURNS",
] as const;

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe("resolveMemorySettings", () => {
  it("defaults to none with no global and no env", () => {
    expect(resolveMemorySettings(null)).toEqual({
      strategy: "none",
      maxHistoryChars: 8000,
      keepRecentTurns: 10,
    });
  });

  it("prefers the global over env", () => {
    process.env.CHAT_MEMORY_STRATEGY = "none";
    const resolved = resolveMemorySettings({
      memory: { strategy: "window", keepRecentTurns: 4 },
    });
    expect(resolved.strategy).toBe("window");
    expect(resolved.keepRecentTurns).toBe(4);
  });

  it("uses env when the global has no memory group", () => {
    process.env.CHAT_MEMORY_STRATEGY = "window";
    process.env.CHAT_MEMORY_KEEP_TURNS = "6";
    const resolved = resolveMemorySettings({});
    expect(resolved.strategy).toBe("window");
    expect(resolved.keepRecentTurns).toBe(6);
  });

  it("falls back to none for an unrecognized strategy", () => {
    expect(
      resolveMemorySettings({ memory: { strategy: "banana" } }).strategy,
    ).toBe("none");
  });

  it("ignores non-positive numeric settings", () => {
    const resolved = resolveMemorySettings({
      memory: { strategy: "window", keepRecentTurns: 0, maxHistoryChars: -5 },
    });
    expect(resolved.keepRecentTurns).toBe(10);
    expect(resolved.maxHistoryChars).toBe(8000);
  });

  // Payload returns null for an unset group field rather than omitting it.
  it("treats a null memory group as unset", () => {
    process.env.CHAT_MEMORY_STRATEGY = "window";
    expect(resolveMemorySettings({ memory: null }).strategy).toBe("window");
  });
});
