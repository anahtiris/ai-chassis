import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  tool: vi.fn(),
  jsonSchema: vi.fn(),
}));
vi.mock("@/lib/ai/provider", () => ({
  getModel: vi.fn(),
  getProviderChain: vi.fn(),
  isRetryableProviderError: vi.fn(),
}));
vi.mock("@/lib/knowledge/provider", () => ({ getKnowledgeProvider: vi.fn() }));
vi.mock("@/lib/ai/promptRegistry", () => ({ getActivePrompt: vi.fn() }));
vi.mock("@/lib/ai/generativeTools", () => ({
  generativeTools: {},
  generativeToolHandlers: { request_table: vi.fn() },
  GENERATIVE_TOOL_GUIDANCE: "TOOL GUIDANCE",
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    aiConversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

import { generateText } from "ai";
import {
  getModel,
  getProviderChain,
  isRetryableProviderError,
} from "@/lib/ai/provider";
import { getKnowledgeProvider } from "@/lib/knowledge/provider";
import { getActivePrompt } from "@/lib/ai/promptRegistry";
import { generativeToolHandlers } from "@/lib/ai/generativeTools";
import { prisma } from "@/lib/db/client";
import { getConciergeResponse } from "./concierge";

describe("getConciergeResponse", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(getModel)
      .mockReset()
      .mockReturnValue("fake-model" as never);
    vi.mocked(getProviderChain).mockReset().mockReturnValue(["openai"]);
    vi.mocked(isRetryableProviderError).mockReset().mockReturnValue(false);
    vi.mocked(getKnowledgeProvider).mockReset();
    vi.mocked(getActivePrompt).mockReset();
    vi.mocked(prisma.aiConversation.findFirst).mockReset();
    vi.mocked(prisma.aiConversation.create).mockReset();
    vi.mocked(prisma.aiConversation.update).mockReset();
    vi.mocked(generativeToolHandlers.request_table).mockReset();
  });

  it("uses the configured prompt, model, temperature, and max_tokens, and creates a new conversation", async () => {
    vi.mocked(getActivePrompt).mockResolvedValue({
      version_id: "ver-2",
      prompt_text: "You are Acme Corp support.",
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 300,
      allow_fallback: false,
      version: 2,
    });
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi
        .fn()
        .mockResolvedValue([
          { content: "Acme sells widgets.", source: "pages" },
        ]),
    });
    vi.mocked(generateText).mockResolvedValue({
      text: "We sell widgets!",
      toolCalls: [],
    } as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue(null);

    const result = await getConciergeResponse("session-1", "What do you sell?");

    expect(result).toEqual({ type: "text", text: "We sell widgets!" });
    expect(getModel).toHaveBeenCalledWith("gpt-4o-mini", "openai");
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "fake-model",
        system: expect.stringContaining("You are Acme Corp support."),
        prompt: "What do you sell?",
        temperature: 0.3,
        maxTokens: 300,
      }),
    );
    const systemPrompt = vi.mocked(generateText).mock.calls[0][0]
      .system as string;
    expect(systemPrompt).toContain("Acme sells widgets.");
    expect(prisma.aiConversation.create).toHaveBeenCalledWith({
      data: {
        session_id: "session-1",
        messages: [
          { role: "user", content: "What do you sell?" },
          { role: "assistant", content: "We sell widgets!" },
        ],
        ai_prompt_version_id: "ver-2",
      },
    });
  });

  it("runs the matching generative-ui-kit handler and returns its render payload when the model calls a tool", async () => {
    vi.mocked(getActivePrompt).mockResolvedValue(null);
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi.fn().mockResolvedValue([]),
    });
    vi.mocked(generateText).mockResolvedValue({
      text: "",
      toolCalls: [
        {
          toolCallId: "call-1",
          toolName: "request_table",
          args: { title: "Slots" },
        },
      ],
    } as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue(null);
    vi.mocked(generativeToolHandlers.request_table).mockResolvedValue({
      render: { component: "TableRenderer", props: { title: "Slots" } },
      forModel: { status: "ok" },
    });

    const result = await getConciergeResponse("session-4", "show me a table");

    expect(generativeToolHandlers.request_table).toHaveBeenCalledWith({
      title: "Slots",
    });
    expect(result).toEqual({
      type: "tool_call",
      toolCallId: "call-1",
      toolName: "request_table",
      input: { title: "Slots" },
      render: { component: "TableRenderer", props: { title: "Slots" } },
      forModel: { status: "ok" },
    });
    expect(prisma.aiConversation.create).toHaveBeenCalledWith({
      data: {
        session_id: "session-4",
        messages: [
          { role: "user", content: "show me a table" },
          {
            role: "assistant",
            toolCall: {
              id: "call-1",
              name: "request_table",
              input: { title: "Slots" },
            },
          },
        ],
        ai_prompt_version_id: null,
      },
    });
  });

  it("falls back to text when the model calls a tool with no matching handler", async () => {
    vi.mocked(getActivePrompt).mockResolvedValue(null);
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi.fn().mockResolvedValue([]),
    });
    vi.mocked(generateText).mockResolvedValue({
      text: "",
      toolCalls: [{ toolCallId: "call-2", toolName: "unknown_tool", args: {} }],
    } as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue(null);

    const result = await getConciergeResponse("session-5", "do something odd");

    expect(result).toEqual({
      type: "text",
      text: 'Sorry, I tried to use "unknown_tool" but that isn\'t available.',
    });
  });

  it("falls back to a default system prompt and no model override when no config row exists", async () => {
    vi.mocked(getActivePrompt).mockResolvedValue(null);
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi.fn().mockResolvedValue([]),
    });
    vi.mocked(generateText).mockResolvedValue({
      text: "Hi there.",
      toolCalls: [],
    } as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue(null);

    await getConciergeResponse("session-2", "Hello");

    expect(getModel).toHaveBeenCalledWith(undefined, "openai");
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: undefined, maxTokens: undefined }),
    );
    const systemPrompt = vi.mocked(generateText).mock.calls[0][0]
      .system as string;
    expect(systemPrompt).toContain("helpful concierge assistant");
  });

  it("appends to an existing conversation instead of creating a new one", async () => {
    vi.mocked(getActivePrompt).mockResolvedValue(null);
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi.fn().mockResolvedValue([]),
    });
    vi.mocked(generateText).mockResolvedValue({
      text: "Second reply.",
      toolCalls: [],
    } as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue({
      id: "c1",
      session_id: "session-3",
      messages: [
        { role: "user", content: "First message" },
        { role: "assistant", content: "First reply." },
      ],
      created_at: new Date(),
    } as never);

    await getConciergeResponse("session-3", "Second message");

    expect(prisma.aiConversation.create).not.toHaveBeenCalled();
    expect(prisma.aiConversation.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        messages: [
          { role: "user", content: "First message" },
          { role: "assistant", content: "First reply." },
          { role: "user", content: "Second message" },
          { role: "assistant", content: "Second reply." },
        ],
      },
    });
  });
});
