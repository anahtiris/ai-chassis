import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({ generateText: vi.fn() }))
vi.mock('@/lib/ai/provider', () => ({ getModel: vi.fn() }))
vi.mock('@/lib/knowledge/provider', () => ({ getKnowledgeProvider: vi.fn() }))
vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiPromptConfig: { findUnique: vi.fn() },
    aiConversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

import { generateText } from 'ai'
import { getModel } from '@/lib/ai/provider'
import { getKnowledgeProvider } from '@/lib/knowledge/provider'
import { prisma } from '@/lib/db/client'
import { getConciergeResponse } from './concierge'

describe('getConciergeResponse', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset()
    vi.mocked(getModel)
      .mockReset()
      .mockReturnValue('fake-model' as never)
    vi.mocked(getKnowledgeProvider).mockReset()
    vi.mocked(prisma.aiPromptConfig.findUnique).mockReset()
    vi.mocked(prisma.aiConversation.findFirst).mockReset()
    vi.mocked(prisma.aiConversation.create).mockReset()
    vi.mocked(prisma.aiConversation.update).mockReset()
  })

  it('uses the configured prompt, model, temperature, and max_tokens, and creates a new conversation', async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue({
      id: 'p1',
      key: 'concierge-system-prompt',
      prompt_text: 'You are Acme Corp support.',
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 300,
      version: 2,
      created_at: new Date(),
      updated_at: new Date(),
    } as never)
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi
        .fn()
        .mockResolvedValue([
          { content: 'Acme sells widgets.', source: 'pages' },
        ]),
    })
    vi.mocked(generateText).mockResolvedValue({
      text: 'We sell widgets!',
    } as never)
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue(null)

    const result = await getConciergeResponse('session-1', 'What do you sell?')

    expect(result).toEqual({ reply: 'We sell widgets!' })
    expect(getModel).toHaveBeenCalledWith('gpt-4o-mini')
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'fake-model',
        system: expect.stringContaining('You are Acme Corp support.'),
        prompt: 'What do you sell?',
        temperature: 0.3,
        maxTokens: 300,
      }),
    )
    const systemPrompt = vi.mocked(generateText).mock.calls[0][0]
      .system as string
    expect(systemPrompt).toContain('Acme sells widgets.')
    expect(prisma.aiConversation.create).toHaveBeenCalledWith({
      data: {
        session_id: 'session-1',
        messages: [
          { role: 'user', content: 'What do you sell?' },
          { role: 'assistant', content: 'We sell widgets!' },
        ],
      },
    })
  })

  it('falls back to a default system prompt and no model override when no config row exists', async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue(null)
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi.fn().mockResolvedValue([]),
    })
    vi.mocked(generateText).mockResolvedValue({ text: 'Hi there.' } as never)
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue(null)

    await getConciergeResponse('session-2', 'Hello')

    expect(getModel).toHaveBeenCalledWith(undefined)
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: undefined, maxTokens: undefined }),
    )
    const systemPrompt = vi.mocked(generateText).mock.calls[0][0]
      .system as string
    expect(systemPrompt).toContain('helpful concierge assistant')
  })

  it('appends to an existing conversation instead of creating a new one', async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue(null)
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi.fn().mockResolvedValue([]),
    })
    vi.mocked(generateText).mockResolvedValue({
      text: 'Second reply.',
    } as never)
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue({
      id: 'c1',
      session_id: 'session-3',
      messages: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First reply.' },
      ],
      created_at: new Date(),
    } as never)

    await getConciergeResponse('session-3', 'Second message')

    expect(prisma.aiConversation.create).not.toHaveBeenCalled()
    expect(prisma.aiConversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First reply.' },
          { role: 'user', content: 'Second message' },
          { role: 'assistant', content: 'Second reply.' },
        ],
      },
    })
  })
})
