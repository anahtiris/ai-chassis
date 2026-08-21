import type { MemoryStrategy, PreparedHistory, StoredHistory } from "./types";

// Today's behavior: the model sees only the current message. The default,
// so adopting this module changes nothing until an operator opts in.
export class NoneStrategy implements MemoryStrategy {
  prepare(_history: StoredHistory): PreparedHistory {
    return { summary: null, turns: [] };
  }

  async compact(_history: StoredHistory): Promise<StoredHistory | null> {
    return null;
  }
}

// Sends the most recent N messages verbatim. No model call, deterministic,
// free. Deliberately never compacts: it narrows what is *sent* and leaves
// stored history untouched, so /admin/ai/conversations keeps the full
// transcript for review.
export class WindowStrategy implements MemoryStrategy {
  constructor(private readonly keepRecentTurns: number) {}

  prepare(history: StoredHistory): PreparedHistory {
    return {
      summary: null,
      turns: history.turns.slice(-this.keepRecentTurns),
    };
  }

  async compact(_history: StoredHistory): Promise<StoredHistory | null> {
    return null;
  }
}
