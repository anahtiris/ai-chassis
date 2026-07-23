"use client";

import { useState } from "react";
import { GenerativeChat, defaultRenderers } from "generative-ui-kit";
import type {
  ChatMessage,
  ChatStreamEvent,
  Suggestion,
} from "generative-ui-kit";

const suggestions: Suggestion[] = [
  {
    label: "What is this site about?",
    sampleMessage: "What is this site about?",
  },
  { label: "How do I get started?", sampleMessage: "How do I get started?" },
  { label: "Who can I contact?", sampleMessage: "Who can I contact for help?" },
];

export default function ConciergeDemoPage() {
  const [sessionId] = useState(() => crypto.randomUUID());

  async function* onSend(
    messages: ChatMessage[],
  ): AsyncIterable<ChatStreamEvent> {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const res = await fetch("/api/concierge-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: lastUserMessage?.content ?? "",
      }),
    });
    if (!res.ok) throw new Error(`Concierge request failed (${res.status})`);
    const data = (await res.json()) as { type: "text"; text: string };
    yield { type: "text_done", text: data.text };
  }

  return (
    <main className="mx-auto max-w-2xl min-h-screen space-y-4 bg-background p-6 text-foreground">
      <h1 className="text-xl font-semibold">
        Concierge demo (generative-ui-kit + Ollama)
      </h1>
      <GenerativeChat
        onSend={onSend}
        suggestions={suggestions}
        renderers={defaultRenderers}
      />
    </main>
  );
}
