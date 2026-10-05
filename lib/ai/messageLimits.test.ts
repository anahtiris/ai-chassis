import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_MESSAGE_CHARS,
  getMaxBodyBytes,
  getMaxMessageChars,
} from "@/lib/ai/messageLimits";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getMaxMessageChars", () => {
  it("defaults to 2000 when unconfigured", () => {
    vi.stubEnv("CONCIERGE_MAX_MESSAGE_CHARS", "");
    expect(getMaxMessageChars()).toBe(DEFAULT_MAX_MESSAGE_CHARS);
    expect(DEFAULT_MAX_MESSAGE_CHARS).toBe(2000);
  });

  it("uses a configured value", () => {
    vi.stubEnv("CONCIERGE_MAX_MESSAGE_CHARS", "500");
    expect(getMaxMessageChars()).toBe(500);
  });

  it("floors a fractional value", () => {
    vi.stubEnv("CONCIERGE_MAX_MESSAGE_CHARS", "500.9");
    expect(getMaxMessageChars()).toBe(500);
  });

  it.each(["0", "-1", "abc", "NaN", "Infinity"])(
    "falls back to the default for %s",
    (value) => {
      vi.stubEnv("CONCIERGE_MAX_MESSAGE_CHARS", value);
      expect(getMaxMessageChars()).toBe(DEFAULT_MAX_MESSAGE_CHARS);
    },
  );
});

describe("getMaxBodyBytes", () => {
  it("leaves room for multi-byte text and JSON escaping", () => {
    vi.stubEnv("CONCIERGE_MAX_MESSAGE_CHARS", "2000");
    // A 2000-character Thai message is ~6000 UTF-8 bytes, or ~12000 if the
    // client \u-escapes it. The bound only has to stop a runaway body, so it
    // sits well above both rather than close to either.
    expect(getMaxBodyBytes()).toBeGreaterThan(12_000);
  });

  it("tracks the configured message cap", () => {
    vi.stubEnv("CONCIERGE_MAX_MESSAGE_CHARS", "500");
    const small = getMaxBodyBytes();
    vi.stubEnv("CONCIERGE_MAX_MESSAGE_CHARS", "4000");
    expect(getMaxBodyBytes()).toBeGreaterThan(small);
  });
});
