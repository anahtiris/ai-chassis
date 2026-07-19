import { generateText } from 'ai'
import { getModel } from '@/lib/ai/provider'
import { getKnowledgeProvider } from '@/lib/knowledge/provider'
import { prisma } from '@/lib/db/client'
import type { Prisma } from '@prisma/client'

// The one AiPromptConfig row this reads — matches the example key shown as
// placeholder text in app/admin/(shell)/ai/prompts/page.tsx. Create it via
// that admin page before expecting anything other than the default prompt
// and provider-default model below.
const CONCIERGE_PROMPT_KEY = 'concierge-system-prompt'

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful concierge assistant for this website. Answer using the provided context when relevant, and say so plainly if you do not know.'

export interface ConciergeResult {
  reply: string
}

// Orchestrates one concierge turn: resolve prompt/model settings from
// AiPromptConfig, pull context from the pluggable knowledge layer, call the
// pluggable model provider, and append the exchange to AiConversation. Not
// itself an HTTP endpoint — see app/api/concierge/route.ts for that.
export async function getConciergeResponse(
  sessionId: string,
  userMessage: string,
): Promise<ConciergeResult> {
  const promptConfig = await prisma.aiPromptConfig.findUnique({
    where: { key: CONCIERGE_PROMPT_KEY },
  })

  const knowledge =
    await getKnowledgeProvider().getRelevantKnowledge(userMessage)
  const context = knowledge.map((chunk) => `- ${chunk.content}`).join('\n')

  const systemPrompt = [
    promptConfig?.prompt_text ?? DEFAULT_SYSTEM_PROMPT,
    context ? `Context:\n${context}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n')

  const { text } = await generateText({
    model: getModel(promptConfig?.model ?? undefined),
    system: systemPrompt,
    prompt: userMessage,
    temperature: promptConfig?.temperature ?? undefined,
    maxTokens: promptConfig?.max_tokens ?? undefined,
  })

  const existing = await prisma.aiConversation.findFirst({
    where: { session_id: sessionId },
    orderBy: { created_at: 'desc' },
  })
  const priorMessages: Prisma.JsonArray = Array.isArray(existing?.messages)
    ? existing.messages
    : []
  const nextMessages: Prisma.JsonArray = [
    ...priorMessages,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: text },
  ]

  if (existing) {
    await prisma.aiConversation.update({
      where: { id: existing.id },
      data: { messages: nextMessages },
    })
  } else {
    await prisma.aiConversation.create({
      data: { session_id: sessionId, messages: nextMessages },
    })
  }

  return { reply: text }
}
