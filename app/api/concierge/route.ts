import { NextRequest, NextResponse } from "next/server";
import { getConciergeResponse } from "@/lib/ai/concierge";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rateLimit = await checkRateLimit(`concierge:${ip}`);
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rateLimit.reset - Date.now()) / 1000),
      );
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

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
      const result = await getConciergeResponse(sessionId, message);
      return NextResponse.json(result);
    } catch (error) {
      console.error("Error in getConciergeResponse:", error);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Error parsing request body:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
