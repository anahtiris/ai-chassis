// A single stored message. "Turn" means one message here, not a
// user/assistant pair — every count and window size in this module is
// measured in messages.
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// What is on disk for one conversation, already parsed.
export interface StoredHistory {
  turns: ConversationTurn[];
  summary: string | null;
  // How many of `turns` are already folded into `summary`. Slicing from
  // this offset is what stops the same turns being summarized twice.
  summaryTurns: number;
}

// What this turn's model call should receive.
export interface PreparedHistory {
  // Appended to the system prompt, not sent as a message.
  summary: string | null;
  // Sent as generateText's `messages`, before the current user message.
  turns: ConversationTurn[];
}

export interface MemorySettings {
  strategy: "none" | "window" | "summary";
  // Character budget over the serialized history — a rough four-characters-
  // per-token proxy, deliberately imprecise. Unused by the strategies in
  // strategies.ts; the summary strategy consumes it.
  maxHistoryChars: number;
  keepRecentTurns: number;
}

export interface MemoryStrategy {
  // Synchronous and pure: no I/O, no model call. Runs on every turn,
  // in the request path, before the model is called.
  prepare(history: StoredHistory): PreparedHistory;
  // May call a model. Runs after the reply has been produced, so it never
  // delays a response. Returns null when there is nothing to do.
  compact(history: StoredHistory): Promise<StoredHistory | null>;
}
