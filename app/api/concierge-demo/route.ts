import { NextRequest, NextResponse } from "next/server";
import { getConciergeResponse } from "@/lib/ai/concierge";

// Thin wrapper so generative-ui-kit's GenerativeChat can drive the real
// concierge orchestration (prompt config, knowledge grounding, conversation
// logging) — see lib/ai/concierge.ts. Text-only for now, no tool-call
// renderers wired up yet.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    sessionId?: unknown;
    message?: unknown;
  };
  const { sessionId, message } = body;

  if (
    typeof sessionId !== "string" ||
    !sessionId.trim() ||
    typeof message !== "string" ||
    !message.trim()
  ) {
    return NextResponse.json(
      { error: "sessionId and message are required" },
      { status: 400 },
    );
  }

  try {
    const { reply } = await getConciergeResponse(sessionId, message);
    return NextResponse.json({ type: "text", text: reply });
  } catch (error) {
    console.error("Error in getConciergeResponse:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
