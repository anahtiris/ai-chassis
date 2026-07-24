"use client";

import { useState } from "react";
import { GenerativeChat, defaultRenderers } from "generative-ui-kit";
import type {
  ChatMessage,
  ChatStreamEvent,
  RenderPayload,
  Suggestion,
} from "generative-ui-kit";

// Floating AI concierge widget, rendered by public content pages only when the
// page's AI Concierge is enabled (see app/(app)/(site)/[slug]/page.tsx). A
// bottom-right toggle expands a panel containing generative-ui-kit's
// GenerativeChat, wired to the real /api/concierge orchestration. `suggestions`
// come resolved from Payload ({ label, sampleMessage }) — the chip shows
// `label`, clicking sends `sampleMessage`.
export function ConciergeWidget({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  const [open, setOpen] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());

  async function* onSend(
    messages: ChatMessage[],
  ): AsyncIterable<ChatStreamEvent> {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const res = await fetch("/api/concierge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: lastUserMessage?.content ?? "",
      }),
    });
    if (!res.ok) throw new Error(`Concierge request failed (${res.status})`);
    const data = (await res.json()) as
      | { type: "text"; text: string }
      | {
          type: "tool_call";
          toolCallId: string;
          toolName: string;
          input: Record<string, unknown>;
          render: RenderPayload;
          forModel: Record<string, unknown>;
        };

    if (data.type === "tool_call") {
      yield {
        type: "tool_call",
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        input: data.input,
        render: data.render,
        forModel: data.forModel,
      };
    } else {
      yield { type: "text_done", text: data.text };
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="bg-background flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-medium">Ask the concierge</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close concierge"
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="overflow-y-auto p-3">
            <GenerativeChat
              onSend={onSend}
              suggestions={suggestions}
              renderers={defaultRenderers}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close concierge" : "Open concierge"}
        className="bg-primary text-primary-foreground flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-lg transition-transform hover:scale-105"
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
