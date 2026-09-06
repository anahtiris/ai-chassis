"use client";

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
  async function* onSend(
    messages: ChatMessage[],
  ): AsyncIterable<ChatStreamEvent> {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    // No session id is sent or held here. The route issues one as a signed
    // httpOnly cookie (lib/ai/sessionCookie.ts) that this code cannot read,
    // which is the point — the previous sessionStorage id was readable by
    // every script on the page. `credentials` is load-bearing rather than
    // decorative: the cookie is what identifies the conversation.
    const res = await fetch("/api/concierge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ message: lastUserMessage?.content ?? "" }),
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
