import { NoneStrategy, WindowStrategy } from "./strategies";
import { SummaryStrategy } from "./summary";
import type { MemorySettings, MemoryStrategy } from "./types";

// The seam, matching lib/ai/provider.ts's getModel() and
// lib/knowledge/provider.ts's getKnowledgeProvider(): one switch returning
// one implementation behind one interface. Adding a strategy means adding a
// case; nothing that calls this changes.
//
// An unrecognized value falls back to NoneStrategy rather than throwing —
// this is read from operator-editable settings, and a typo there should
// degrade to today's behavior, not break the concierge.
export function getMemoryStrategy(settings: MemorySettings): MemoryStrategy {
  switch (settings.strategy) {
    case "window":
      return new WindowStrategy(settings.keepRecentTurns);
    case "summary":
      return new SummaryStrategy(settings);
    case "none":
      return new NoneStrategy();
    default:
      return new NoneStrategy();
  }
}
