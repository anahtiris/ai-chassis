import type { ConversationTurn, StoredHistory } from "./types";

// AiConversation.messages is a Json column written by concierge.ts's
// appendToConversation(). Rows predate this module and may hold shapes it
// does not expect, including assistant tool-call entries that carry a
// `toolCall` object instead of `content`. Anything unreadable is skipped
// rather than thrown on — a malformed transcript must degrade to "no
// memory", never to a failed request.
export function parseStoredHistory(
  messages: unknown,
  summary: string | null = null,
  summaryTurns = 0,
): StoredHistory {
  if (!Array.isArray(messages)) {
    return { turns: [], summary, summaryTurns };
  }

  const turns: ConversationTurn[] = [];
  for (const entry of messages) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content) continue;
    turns.push({ role, content });
  }

  return { turns, summary, summaryTurns };
}
