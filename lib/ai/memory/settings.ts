import { getPayloadClient } from "@/lib/payload/client";
import type { MemorySettings } from "./types";

const DEFAULTS: MemorySettings = {
  strategy: "none",
  maxHistoryChars: 8000,
  keepRecentTurns: 10,
};

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function strategyOrDefault(value: unknown): MemorySettings["strategy"] {
  return value === "window" || value === "none" || value === "summary"
    ? value
    : DEFAULTS.strategy;
}

// Precedence: the AiConcierge global (operator-editable at /admin/cms, no
// deploy), then env (so a fresh fork boots before anything is configured),
// then the defaults above. Mirrors how AiPromptConfig overrides the
// AI_PROVIDER defaults rather than replacing them.
//
// `??` throughout, not `||`: a group field Payload stores as null must fall
// through to env, but a legitimately-zero number must not (positiveNumber
// rejects it separately, with a fallback, rather than silently accepting a
// window of 0 turns).
export function resolveMemorySettings(global: unknown): MemorySettings {
  const memory =
    global && typeof global === "object"
      ? ((global as { memory?: unknown }).memory as
          Record<string, unknown> | null | undefined)
      : undefined;

  return {
    strategy: strategyOrDefault(
      memory?.strategy ?? process.env.CHAT_MEMORY_STRATEGY,
    ),
    maxHistoryChars: positiveNumber(
      memory?.maxHistoryChars ?? process.env.CHAT_MEMORY_MAX_CHARS,
      DEFAULTS.maxHistoryChars,
    ),
    keepRecentTurns: positiveNumber(
      memory?.keepRecentTurns ?? process.env.CHAT_MEMORY_KEEP_TURNS,
      DEFAULTS.keepRecentTurns,
    ),
  };
}

// A failed global fetch must not break the concierge — an unreachable or
// unmigrated Payload degrades to env/defaults, i.e. today's behavior.
export async function getMemorySettings(): Promise<MemorySettings> {
  try {
    const payload = await getPayloadClient();
    const global = await payload.findGlobal({ slug: "aiConcierge" });
    return resolveMemorySettings(global);
  } catch (error) {
    console.warn("[memory] falling back to default settings:", error);
    return resolveMemorySettings(null);
  }
}
