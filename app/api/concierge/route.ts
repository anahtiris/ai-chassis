import { NextRequest, NextResponse } from 'next/server'
import { getConciergeResponse } from '@/lib/ai/concierge'

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    sessionId?: unknown
    message?: unknown
  }
  const { sessionId, message } = body

  if (
    typeof sessionId !== 'string' ||
    !sessionId.trim() ||
    typeof message !== 'string' ||
    !message.trim()
  ) {
    return NextResponse.json(
      { error: 'sessionId and message are required' },
      { status: 400 },
    )
  }

  const result = await getConciergeResponse(sessionId, message)
  return NextResponse.json(result)
}
