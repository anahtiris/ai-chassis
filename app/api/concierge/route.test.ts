import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/ai/concierge", () => ({ getConciergeResponse: vi.fn() }));

import { getConciergeResponse } from "@/lib/ai/concierge";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/concierge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/concierge", () => {
  it("returns the reply for a valid request", async () => {
    vi.mocked(getConciergeResponse).mockResolvedValue({
      type: "text",
      text: "Hello!",
    });

    const response = await POST(
      makeRequest({ sessionId: "abc", message: "Hi" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: "text", text: "Hello!" });
    expect(getConciergeResponse).toHaveBeenCalledWith("abc", "Hi");
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

    const response = await POST(
      makeRequest({ sessionId: "abc", message: "show me a table" }),
    );

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

  it("rejects a request missing sessionId", async () => {
    const response = await POST(makeRequest({ message: "Hi" }));
    expect(response.status).toBe(400);
  });

  it("rejects a request with an empty message", async () => {
    const response = await POST(
      makeRequest({ sessionId: "abc", message: "   " }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 500 JSON for malformed request body", async () => {
    const request = new NextRequest("http://localhost/api/concierge", {
      method: "POST",
      body: "not valid json",
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Something went wrong" });
  });

  it("returns 500 JSON when getConciergeResponse throws", async () => {
    vi.mocked(getConciergeResponse).mockRejectedValue(
      new Error("RAG misconfigured"),
    );

    const response = await POST(
      makeRequest({ sessionId: "abc", message: "Hi" }),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Something went wrong" });
  });
});
