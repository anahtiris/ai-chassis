import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/ai/concierge", () => ({ getConciergeResponse: vi.fn() }));

// Not under test here, and the in-memory limiter is module-level state shared
// by every case in this file — without this the later cases trip its 10/minute
// cap and assert against a 429 instead of the route's own behavior.
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 9,
    reset: Date.now() + 60_000,
  })),
}));

import { getConciergeResponse } from "@/lib/ai/concierge";
import {
  CONCIERGE_SESSION_COOKIE,
  issueSessionCookie,
} from "@/lib/ai/sessionCookie";
import {
  DEFAULT_MAX_MESSAGE_CHARS,
  getMaxBodyBytes,
} from "@/lib/ai/messageLimits";
import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-secret-value");
  vi.mocked(getConciergeResponse).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeRequest(body: unknown, cookie?: string) {
  const serialized = JSON.stringify(body);
  const headers = new Headers({
    "content-length": String(Buffer.byteLength(serialized)),
  });
  if (cookie) headers.set("cookie", `${CONCIERGE_SESSION_COOKIE}=${cookie}`);

  return new NextRequest("http://localhost/api/concierge", {
    method: "POST",
    body: serialized,
    headers,
  });
}

function sessionIdPassedToConcierge(): string {
  return vi.mocked(getConciergeResponse).mock.calls[0][0];
}

describe("POST /api/concierge", () => {
  it("returns the reply for a valid request", async () => {
    vi.mocked(getConciergeResponse).mockResolvedValue({
      type: "text",
      text: "Hello!",
    });

    const response = await POST(makeRequest({ message: "Hi" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: "text", text: "Hello!" });
    expect(getConciergeResponse).toHaveBeenCalledWith(
      expect.any(String),
      "Hi",
    );
  });

  it("returns a tool_call render payload when the concierge picks a tool", async () => {
    vi.mocked(getConciergeResponse).mockResolvedValue({
      type: "tool_call",
      toolCallId: "call-1",
      toolName: "request_table",
      input: { title: "Slots" },
      render: { component: "TableRenderer", props: { title: "Slots" } },
      forModel: { status: "ok" },
    });

    const response = await POST(makeRequest({ message: "show me a table" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: "tool_call",
      toolCallId: "call-1",
      toolName: "request_table",
      input: { title: "Slots" },
      render: { component: "TableRenderer", props: { title: "Slots" } },
      forModel: { status: "ok" },
    });
  });

  it("rejects a request with an empty message", async () => {
    const response = await POST(makeRequest({ message: "   " }));
    expect(response.status).toBe(400);
  });

  it("rejects a request with no message at all", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 500 JSON for malformed request body", async () => {
    const request = new NextRequest("http://localhost/api/concierge", {
      method: "POST",
      body: "not valid json",
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong" });
  });

  it("returns 500 JSON when getConciergeResponse throws", async () => {
    vi.mocked(getConciergeResponse).mockRejectedValue(
      new Error("RAG misconfigured"),
    );

    const response = await POST(makeRequest({ message: "Hi" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong" });
  });
});

describe("POST /api/concierge session identity", () => {
  beforeEach(() => {
    vi.mocked(getConciergeResponse).mockResolvedValue({
      type: "text",
      text: "Hello!",
    });
  });

  it("issues a signed httpOnly cookie when the caller has none", async () => {
    const response = await POST(makeRequest({ message: "Hi" }));

    const cookie = response.cookies.get(CONCIERGE_SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    // The signature travels in the cookie; only the bare id reaches the DB.
    expect(cookie?.value).toContain(`${sessionIdPassedToConcierge()}.`);
  });

  it("reuses the session from a validly signed cookie without reissuing", async () => {
    const { sessionId, value } = issueSessionCookie();

    const response = await POST(makeRequest({ message: "Hi" }, value));

    expect(sessionIdPassedToConcierge()).toBe(sessionId);
    expect(response.cookies.get(CONCIERGE_SESSION_COOKIE)).toBeUndefined();
  });

  it("ignores a sessionId supplied in the request body", async () => {
    const response = await POST(
      makeRequest({ sessionId: "victim-session", message: "Hi" }),
    );

    expect(sessionIdPassedToConcierge()).not.toBe("victim-session");
    expect(response.cookies.get(CONCIERGE_SESSION_COOKIE)).toBeDefined();
  });

  it("ignores a body sessionId even when a valid cookie is present", async () => {
    const { sessionId, value } = issueSessionCookie();

    await POST(makeRequest({ sessionId: "victim-session", message: "Hi" }, value));

    expect(sessionIdPassedToConcierge()).toBe(sessionId);
  });

  it("refuses an unsigned cookie and issues a fresh session instead", async () => {
    const forged = "11111111-1111-4111-8111-111111111111";

    const response = await POST(makeRequest({ message: "Hi" }, forged));

    expect(sessionIdPassedToConcierge()).not.toBe(forged);
    expect(response.cookies.get(CONCIERGE_SESSION_COOKIE)).toBeDefined();
  });

  it("refuses a cookie whose id was swapped onto a valid signature", async () => {
    const victim = issueSessionCookie();
    const attacker = issueSessionCookie();
    const signature = attacker.value.slice(attacker.value.lastIndexOf(".") + 1);

    await POST(
      makeRequest({ message: "Hi" }, `${victim.sessionId}.${signature}`),
    );

    expect(sessionIdPassedToConcierge()).not.toBe(victim.sessionId);
  });

  it("still sets the cookie when the concierge call fails, so the id is stable", async () => {
    vi.mocked(getConciergeResponse).mockRejectedValue(new Error("boom"));

    const response = await POST(makeRequest({ message: "Hi" }));

    expect(response.status).toBe(500);
    expect(response.cookies.get(CONCIERGE_SESSION_COOKIE)).toBeDefined();
  });
});

describe("POST /api/concierge size limits", () => {
  beforeEach(() => {
    vi.mocked(getConciergeResponse).mockResolvedValue({
      type: "text",
      text: "Hello!",
    });
  });

  it("accepts a message exactly at the cap", async () => {
    const response = await POST(
      makeRequest({ message: "a".repeat(DEFAULT_MAX_MESSAGE_CHARS) }),
    );

    expect(response.status).toBe(200);
  });

  it("rejects a message one character over the cap", async () => {
    const response = await POST(
      makeRequest({ message: "a".repeat(DEFAULT_MAX_MESSAGE_CHARS + 1) }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "message is too long",
      maxChars: DEFAULT_MAX_MESSAGE_CHARS,
    });
    expect(getConciergeResponse).not.toHaveBeenCalled();
  });

  it("honours a configured cap", async () => {
    vi.stubEnv("CONCIERGE_MAX_MESSAGE_CHARS", "10");

    const response = await POST(makeRequest({ message: "a".repeat(11) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "message is too long",
      maxChars: 10,
    });
  });

  it("rejects an oversized body before parsing it", async () => {
    const request = new NextRequest("http://localhost/api/concierge", {
      method: "POST",
      body: JSON.stringify({ message: "Hi" }),
      headers: { "content-length": String(getMaxBodyBytes() + 1) },
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(getConciergeResponse).not.toHaveBeenCalled();
  });

  it("does not mint a session for a request it refuses on size", async () => {
    const response = await POST(
      makeRequest({ message: "a".repeat(DEFAULT_MAX_MESSAGE_CHARS + 1) }),
    );

    expect(response.cookies.get(CONCIERGE_SESSION_COOKIE)).toBeUndefined();
  });
});
