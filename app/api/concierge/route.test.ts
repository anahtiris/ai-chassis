import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/ai/concierge', () => ({ getConciergeResponse: vi.fn() }))

import { getConciergeResponse } from '@/lib/ai/concierge'
import { POST } from './route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/concierge', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/concierge', () => {
  it('returns the reply for a valid request', async () => {
    vi.mocked(getConciergeResponse).mockResolvedValue({ reply: 'Hello!' })

    const response = await POST(
      makeRequest({ sessionId: 'abc', message: 'Hi' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ reply: 'Hello!' })
    expect(getConciergeResponse).toHaveBeenCalledWith('abc', 'Hi')
  })

  it('rejects a request missing sessionId', async () => {
    const response = await POST(makeRequest({ message: 'Hi' }))
    expect(response.status).toBe(400)
  })

  it('rejects a request with an empty message', async () => {
    const response = await POST(
      makeRequest({ sessionId: 'abc', message: '   ' }),
    )
    expect(response.status).toBe(400)
  })
})
