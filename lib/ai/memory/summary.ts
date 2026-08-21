import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import { getActivePrompt } from "@/lib/ai/promptRegistry";
import type {
  MemorySettings,
  MemoryStrategy,
  PreparedHistory,
  StoredHistory,
} from "./types";

// Editable at /admin/ai/prompts like every other prompt in this toolkit,
// with its own model setting — summarizing is a cheap-model job and should
// not spend the concierge's model budget.
const SUMMARIZER_PROMPT_KEY = "chat-summarizer-system-prompt";

const DEFAULT_SUMMARIZER_PROMPT =
  "You compress chat history. Rewrite the conversation below as a terse third-person summary that preserves facts, decisions, names, numbers and open questions. Drop pleasantries. Reply with the summary text only.";

function serializedLength(turns: StoredHistory["turns"]): number {
  return turns.reduce((total, turn) => total + turn.content.length, 0);
}

// Maintains a rolling summary: once the history exceeds the character
// budget, the oldest turns are folded into the existing summary and stop
// being sent. The summary is persisted by the caller, so the model call
// below happens once and is amortized across every later turn — recomputing
// per request would mean a second call on every single turn.
export class SummaryStrategy implements MemoryStrategy {
  constructor(private readonly settings: MemorySettings) {}

  prepare(history: StoredHistory): PreparedHistory {
    return {
      summary: history.summary,
      turns: history.turns.slice(history.summaryTurns),
    };
  }

  async compact(history: StoredHistory): Promise<StoredHistory | null> {
    const live = history.turns.slice(history.summaryTurns);
    if (serializedLength(live) <= this.settings.maxHistoryChars) return null;

    // Nothing to fold once the recent-turns window already covers
    // everything still live — a budget smaller than the window is a
    // misconfiguration, not a reason to summarize turns we must keep.
    const foldCount = live.length - this.settings.keepRecentTurns;
    if (foldCount <= 0) return null;

    const toFold = live.slice(0, foldCount);
    const transcript = toFold
      .map((turn) => `${turn.role}: ${turn.content}`)
      .join("\n");
    const promptConfig = await getActivePrompt(SUMMARIZER_PROMPT_KEY);

    try {
      const { text } = await generateText({
        model: getModel(promptConfig?.model ?? undefined),
        system: promptConfig?.prompt_text ?? DEFAULT_SUMMARIZER_PROMPT,
        prompt: history.summary
          ? `Summary so far:\n${history.summary}\n\nNew messages to fold in:\n${transcript}`
          : `Messages to summarize:\n${transcript}`,
        temperature: promptConfig?.temperature ?? undefined,
        maxTokens: promptConfig?.max_tokens ?? undefined,
      });

      return {
        turns: history.turns,
        summary: text.trim(),
        summaryTurns: history.summaryTurns + foldCount,
      };
    } catch (error) {
      // The reply has already been sent by the time this runs. A failed
      // summarization must not surface to the user — leave history
      // uncompacted and let the next turn retry.
      console.warn("[memory] summarization failed:", error);
      return null;
    }
  }
}
