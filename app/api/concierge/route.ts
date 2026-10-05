import { NextRequest, NextResponse } from "next/server";
import { getConciergeResponse } from "@/lib/ai/concierge";
import { checkRateLimit } from "@/lib/rateLimit";
import { getMaxBodyBytes, getMaxMessageChars } from "@/lib/ai/messageLimits";
import {
  CONCIERGE_SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  issueSessionCookie,
  readSessionCookie,
} from "@/lib/ai/sessionCookie";

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

    // Before parsing, not after: route handlers have no default body size
    // limit, so request.json() would buffer whatever was sent. A body without
    // a content-length (a chunked upload) still gets through to the parser —
    // closing that would mean reading the stream with a byte counter instead,
    // which this does not do. See lib/ai/messageLimits.ts.
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > getMaxBodyBytes()) {
      return NextResponse.json(
        { error: "Request body is too large" },
        { status: 413 },
      );
    }

    const body = (await request.json()) as { message?: unknown };
    const { message } = body;

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Checked before a session is minted, so a refused request leaves no row
    // and no cookie behind.
    const maxChars = getMaxMessageChars();
    if (message.length > maxChars) {
      return NextResponse.json(
        { error: "message is too long", maxChars },
        { status: 400 },
      );
    }

    // Session identity comes from the signed httpOnly cookie and nowhere else.
    // A `sessionId` in the body is ignored on purpose: it used to be the only
    // source, which meant any caller could name any conversation and have the
    // model read that history back. See lib/ai/sessionCookie.ts. Anything the
    // cookie does not verify — absent, forged, or signed with an old secret —
    // starts a fresh session rather than being trusted.
    let sessionId = readSessionCookie(
      request.cookies.get(CONCIERGE_SESSION_COOKIE)?.value,
    );
    let issuedCookieValue: string | null = null;
    if (!sessionId) {
      const issued = issueSessionCookie();
      sessionId = issued.sessionId;
      issuedCookieValue = issued.value;
    }
    const resolvedSessionId = sessionId;

    // Attached to whichever response is returned, including the error path, so
    // a failed turn doesn't hand the visitor a different id on their retry.
    const withSessionCookie = (response: NextResponse): NextResponse => {
      if (issuedCookieValue) {
        response.cookies.set(
          CONCIERGE_SESSION_COOKIE,
          issuedCookieValue,
          SESSION_COOKIE_OPTIONS,
        );
      }
      return response;
    };

    try {
      const result = await getConciergeResponse(resolvedSessionId, message);
      return withSessionCookie(NextResponse.json(result));
    } catch (error) {
      console.error("Error in getConciergeResponse:", error);
      return withSessionCookie(
        NextResponse.json({ error: "Something went wrong" }, { status: 500 }),
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
