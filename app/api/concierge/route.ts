import { NextRequest, NextResponse } from 'next/server'
import { getConciergeResponse } from '@/lib/ai/concierge'

export async function POST(request: NextRequest) {
  try {
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

    try {
      const result = await getConciergeResponse(sessionId, message)
      return NextResponse.json(result)
    } catch (error) {
      console.error('Error in getConciergeResponse:', error)
      return NextResponse.json(
        { error: 'Something went wrong' },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error parsing request body:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 },
    )
  }
}
