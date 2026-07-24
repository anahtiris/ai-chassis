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
// page's AI Concierge is enabled (see app/(app)/(site)/[slug]/page.tsx). Uses
// generative-ui-kit's own GenerativeChat layout="float" — launcher bubble +
// fixed panel are the kit's, not hand-rolled here — wired to the real
// /api/concierge orchestration. `suggestions` come resolved from Payload
// ({ label, sampleMessage }) — the chip shows `label`, clicking sends
// `sampleMessage`.
export function ConciergeWidget({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
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
    <GenerativeChat
      onSend={onSend}
      suggestions={suggestions}
      renderers={defaultRenderers}
      layout="float"
    />
  );
}
