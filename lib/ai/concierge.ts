import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import { getKnowledgeProvider } from "@/lib/knowledge/provider";
import { getActivePrompt } from "@/lib/ai/promptRegistry";
import { prisma } from "@/lib/db/client";
import {
  generativeTools,
  generativeToolHandlers,
  GENERATIVE_TOOL_GUIDANCE,
} from "@/lib/ai/generativeTools";
import type { Prisma } from "@prisma/client";

// The one AiPromptConfig row this reads — matches the example key shown as
// placeholder text in app/(app)/admin/(shell)/ai/prompts/page.tsx. Create it via
// that admin page before expecting anything other than the default prompt
// and provider-default model below.
const CONCIERGE_PROMPT_KEY = "concierge-system-prompt";

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful concierge assistant for this website. Answer using the provided context when relevant, and say so plainly if you do not know.";

export type ConciergeResult =
  | { type: "text"; text: string }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
      render: unknown;
      forModel: unknown;
    };

// Orchestrates one concierge turn: resolve prompt/model settings from
// AiPromptConfig, pull context from the pluggable knowledge layer, call the
// pluggable model provider (with generative-ui-kit's tools registered — see
// lib/ai/generativeTools.ts), and append the exchange to AiConversation. Not
// itself an HTTP endpoint — see app/api/concierge/route.ts for that.
//
// Single-step tool-calling, matching generative-ui-playground's reference
// server: one generateText call returns either plain text or (at most) one
// tool call; a tool call is executed here via the matching kit handler and
// its render payload returned directly — the model is never called again to
// react to the tool result within the same turn. Whether the model actually
// calls a tool at all depends on the underlying model's tool-calling
// reliability (varies a lot between providers/model sizes).
export async function getConciergeResponse(
  sessionId: string,
  userMessage: string,
): Promise<ConciergeResult> {
  const promptConfig = await getActivePrompt(CONCIERGE_PROMPT_KEY);

  const knowledge =
    await getKnowledgeProvider().getRelevantKnowledge(userMessage);
  const context = knowledge.map((chunk) => `- ${chunk.content}`).join("\n");

  const systemPrompt = [
    promptConfig?.prompt_text ?? DEFAULT_SYSTEM_PROMPT,
    context ? `Context:\n${context}` : null,
    GENERATIVE_TOOL_GUIDANCE,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  const result = await generateText({
    model: getModel(promptConfig?.model ?? undefined),
    system: systemPrompt,
    prompt: userMessage,
    temperature: promptConfig?.temperature ?? undefined,
    maxTokens: promptConfig?.max_tokens ?? undefined,
    tools: generativeTools,
  });

  const toolCall = result.toolCalls?.[0];
  const conciergeResult: ConciergeResult = toolCall
    ? await runGenerativeTool(toolCall)
    : { type: "text", text: result.text };

  await appendToConversation(
    sessionId,
    userMessage,
    conciergeResult,
    promptConfig,
  );

  return conciergeResult;
}

async function runGenerativeTool(toolCall: {
  toolCallId: string;
  toolName: string;
  args: unknown;
}): Promise<ConciergeResult> {
  const handler = generativeToolHandlers[toolCall.toolName];
  const input = (toolCall.args ?? {}) as Record<string, unknown>;
  if (!handler) {
    // No matching kit handler for a tool name the model somehow produced —
    // fall back to text rather than throw, since a broken render is worse
    // than a plain apology.
    return {
      type: "text",
      text: `Sorry, I tried to use "${toolCall.toolName}" but that isn't available.`,
    };
  }

  const { render, forModel } = await handler(input);
  return {
    type: "tool_call",
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input,
    render,
    forModel,
  };
}

async function appendToConversation(
  sessionId: string,
  userMessage: string,
  result: ConciergeResult,
  promptConfig: Awaited<ReturnType<typeof getActivePrompt>>,
): Promise<void> {
  const existing = await prisma.aiConversation.findFirst({
    where: { session_id: sessionId },
    orderBy: { created_at: "desc" },
  });
  const priorMessages: Prisma.JsonArray = Array.isArray(existing?.messages)
    ? existing.messages
    : [];
  // result.input is Record<string, unknown> (parsed from the model's JSON
  // tool-call arguments), so it's JSON-safe by construction even though
  // Prisma.JsonObject's index signature can't see that through `unknown`.
  const assistantEntry: Prisma.JsonObject =
    result.type === "text"
      ? { role: "assistant", content: result.text }
      : {
          role: "assistant",
          toolCall: {
            id: result.toolCallId,
            name: result.toolName,
            input: result.input as Prisma.JsonObject,
          },
        };
  const nextMessages: Prisma.JsonArray = [
    ...priorMessages,
    { role: "user", content: userMessage },
    assistantEntry,
  ];

  if (existing) {
    await prisma.aiConversation.update({
      where: { id: existing.id },
      data: { messages: nextMessages },
    });
  } else {
    await prisma.aiConversation.create({
      data: {
        session_id: sessionId,
        messages: nextMessages,
        // Stamp the exact prompt version used (null when running on the
        // AI_PROVIDER default, i.e. no active/enabled prompt config).
        ai_prompt_version_id: promptConfig?.version_id ?? null,
      },
    });
  }
}
