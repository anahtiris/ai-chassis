# Concierge Concept Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the concierge AI layer end-to-end (Payload content → knowledge provider → `AiPromptConfig` settings → LLM call → conversation log) and prove it actually works with a throwaway manual-test page, closing the "zero callers" gap flagged in `docs/decisions.md` and `CLAUDE.md`.

**Architecture:** `lib/ai/concierge.ts` is the new orchestration point: it reads the `concierge-system-prompt` row from `AiPromptConfig` (model/temperature/max_tokens + prompt text), fetches context via the existing `getKnowledgeProvider()` seam (implementing the `DirectInjectionProvider` stub against the real `pages` collection), calls `getModel()` via the Vercel AI SDK's `generateText`, and logs the exchange to `AiConversation`. `app/api/concierge/route.ts` exposes this as a real POST endpoint — the same one a future chat UI will call. A throwaway page hits that endpoint from a browser so a human can see the whole chain work.

**Tech Stack:** Next.js 16 App Router (Route Handlers), Vercel AI SDK v4 (`generateText`), Payload 3 Local API, Prisma, Vitest.

## Global Constraints

- Match existing file style: single quotes, no semicolons, no trailing types via `any` (see `lib/ai/provider.ts`, `lib/knowledge/provider.ts` for reference). A PostToolUse formatter hook in this environment may reformat files to double-quotes/semicolons on save — if so, rewrite back to single-quotes/no-semicolons before committing (confirmed precedent from a prior session on this repo).
- All LLM calls go through `getModel()` (`lib/ai/provider.ts`) — never import an `@ai-sdk/*` provider package directly outside that file.
- All content retrieval goes through `getKnowledgeProvider()` (`lib/knowledge/provider.ts`) — never query Payload collections for concierge context anywhere else.
- The `AiPromptConfig` row this reads is keyed `'concierge-system-prompt'` (matches the existing placeholder text in `app/admin/(shell)/ai/prompts/page.tsx:111`) — don't invent a different key.
- Run `pnpm vitest run <file>` for single-file test runs, `pnpm typecheck` and `pnpm lint` before every commit.
- Task 5's dummy page is explicitly **not** committed — its own final step is "leave untracked," not "git add."
- No schema changes in this plan — `AiPromptConfig` and `AiConversation` are used as they exist today (see `prisma/schema.prisma`).

---

### Task 1: Extract shared lexical-to-plaintext helper

**Files:**

- Create: `lib/payload/lexicalToPlainText.ts`
- Modify: `payload.config.ts:63-74` (remove the local `lexicalToPlainText` function, import the shared one instead)
- Test: `lib/payload/lexicalToPlainText.test.ts`

**Interfaces:**

- Produces: `lexicalToPlainText(node: unknown): string` — walks a Lexical JSON node tree and concatenates all `text` fields, space-separated. Task 2 imports this.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/payload/lexicalToPlainText.test.ts
import { describe, expect, it } from "vitest";
import { lexicalToPlainText } from "./lexicalToPlainText";

describe("lexicalToPlainText", () => {
  it("concatenates text from nested children", () => {
    const root = {
      children: [
        { children: [{ text: "Hello" }, { text: "world" }] },
        { text: "Second paragraph" },
      ],
    };
    expect(lexicalToPlainText(root)).toBe("Hello world Second paragraph");
  });

  it("returns an empty string for null or non-object input", () => {
    expect(lexicalToPlainText(null)).toBe("");
    expect(lexicalToPlainText(undefined)).toBe("");
    expect(lexicalToPlainText("not an object")).toBe("");
  });

  it("returns an empty string for a node with no text and no children", () => {
    expect(lexicalToPlainText({})).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/payload/lexicalToPlainText.test.ts`
Expected: FAIL with "Failed to resolve import './lexicalToPlainText'" (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/payload/lexicalToPlainText.ts

// Minimal Lexical-JSON-to-plain-text walker — good enough for embedding and
// direct-injection purposes (neither needs formatting preserved). Shared
// between payload.config.ts's RAG knowledge-pool feed and
// lib/knowledge/provider.ts's DirectInjectionProvider so both read the same
// content the same way. Swap for a richer chunker (see
// payloadcms-vectorize's dev/helpers/chunkers.ts for a reference
// implementation) if a project wants heading- or paragraph-aware chunks.
export function lexicalToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const { text, children } = node as { text?: unknown; children?: unknown[] };
  const own = typeof text === "string" ? text : "";
  const nested = Array.isArray(children)
    ? children.map(lexicalToPlainText).join(" ")
    : "";
  return [own, nested].filter(Boolean).join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/payload/lexicalToPlainText.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Update payload.config.ts to use the shared helper**

In `payload.config.ts`, delete the local `function lexicalToPlainText(node: unknown): string { ... }` block (lines 63-74) and add this import near the other `@/lib/*` imports at the top:

```typescript
import { lexicalToPlainText } from "@/lib/payload/lexicalToPlainText";
```

Leave every call site (`lexicalToPlainText(...)` inside `pagesToKnowledgePool`) unchanged — same name, same signature.

- [ ] **Step 6: Verify payload.config.ts still typechecks**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add lib/payload/lexicalToPlainText.ts lib/payload/lexicalToPlainText.test.ts payload.config.ts
git commit -m "refactor: extract shared lexicalToPlainText helper"
```

---

### Task 2: Implement `DirectInjectionProvider.getRelevantKnowledge()`

**Files:**

- Modify: `lib/knowledge/provider.ts`
- Test: `lib/knowledge/provider.test.ts`

**Interfaces:**

- Consumes: `lexicalToPlainText(node: unknown): string` (Task 1). `getPayloadClient(): ReturnType<typeof getPayload>` (`lib/payload/client.ts`, already exists, returns a `Promise<Payload>`).
- Produces: `getKnowledgeProvider(): KnowledgeProvider` — signature unchanged, `DirectInjectionProvider` now returns real chunks instead of `[]`. Task 3 consumes `getKnowledgeProvider()` exactly as it exists today.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/knowledge/provider.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payload/client", () => ({
  getPayloadClient: vi.fn(),
}));

import { getPayloadClient } from "@/lib/payload/client";
import { getKnowledgeProvider } from "./provider";

describe("DirectInjectionProvider (getKnowledgeProvider with RAG_ENABLED unset)", () => {
  beforeEach(() => {
    vi.mocked(getPayloadClient).mockReset();
    delete process.env.RAG_ENABLED;
  });

  it("returns a title chunk and a body chunk per published page", async () => {
    vi.mocked(getPayloadClient).mockResolvedValue({
      find: vi.fn().mockResolvedValue({
        docs: [
          {
            id: 1,
            title: "About Us",
            slug: "about",
            content: {
              root: {
                children: [{ children: [{ text: "We build things." }] }],
              },
            },
          },
        ],
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const provider = getKnowledgeProvider();
    const chunks = await provider.getRelevantKnowledge("anything");

    expect(chunks).toEqual([
      { content: "About Us", source: "pages", sourceUrl: "/about" },
      { content: "We build things.", source: "pages", sourceUrl: "/about" },
    ]);
  });

  it("queries only published pages", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [] });
    vi.mocked(getPayloadClient).mockResolvedValue({ find } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    const provider = getKnowledgeProvider();
    await provider.getRelevantKnowledge("anything");

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "pages",
        where: { _status: { equals: "published" } },
      }),
    );
  });

  it("skips a page with an empty title and empty content", async () => {
    vi.mocked(getPayloadClient).mockResolvedValue({
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 2, title: "", slug: "empty", content: null }],
      }),
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    const provider = getKnowledgeProvider();
    const chunks = await provider.getRelevantKnowledge("anything");

    expect(chunks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/knowledge/provider.test.ts`
Expected: FAIL — first test's `expect(chunks).toEqual([...2 items])` fails because `DirectInjectionProvider` currently always returns `[]`.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `DirectInjectionProvider` in `lib/knowledge/provider.ts`:

```typescript
import { lexicalToPlainText } from "@/lib/payload/lexicalToPlainText";

// ... (keep existing imports, KnowledgeChunk/KnowledgeProvider interfaces as-is)

// Default provider: pulls all published `pages` content directly, no
// embeddings involved. Ignores `query` by design — direct injection means
// "dump everything," matching the class doc comment above (right choice
// while content volume is small; RagProvider below does relevance
// filtering instead).
class DirectInjectionProvider implements KnowledgeProvider {
  async getRelevantKnowledge(_query: string): Promise<KnowledgeChunk[]> {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "pages",
      where: { _status: { equals: "published" } },
      limit: 50,
      depth: 0,
    });

    return docs.flatMap((page): KnowledgeChunk[] => {
      const chunks: KnowledgeChunk[] = [];
      const sourceUrl = `/${page.slug}`;

      if (page.title.trim()) {
        chunks.push({ content: page.title, source: "pages", sourceUrl });
      }

      const bodyText = lexicalToPlainText(page.content?.root).trim();
      if (bodyText) {
        chunks.push({ content: bodyText, source: "pages", sourceUrl });
      }

      return chunks;
    });
  }
}
```

The `getPayloadClient` import already exists in this file (used by `RagProvider`) — reuse it, don't add a second import.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/knowledge/provider.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors (remove the `eslint-disable` comments from the test file first if lint passes without them — keep only if `@typescript-eslint/no-explicit-any` actually fires on the `as any` casts)

- [ ] **Step 6: Commit**

```bash
git add lib/knowledge/provider.ts lib/knowledge/provider.test.ts
git commit -m "feat: implement DirectInjectionProvider against the pages collection"
```

---

### Task 3: Concierge orchestration function

**Files:**

- Create: `lib/ai/concierge.ts`
- Test: `lib/ai/concierge.test.ts`

**Interfaces:**

- Consumes: `getModel(modelName?: string): LanguageModel` (`lib/ai/provider.ts`). `getKnowledgeProvider(): KnowledgeProvider` (`lib/knowledge/provider.ts`, Task 2). `prisma.aiPromptConfig.findUnique`, `prisma.aiConversation.findFirst` / `.create` / `.update` (`lib/db/client.ts`). `generateText` from `ai`.
- Produces: `getConciergeResponse(sessionId: string, userMessage: string): Promise<{ reply: string }>`. Task 4 consumes this exact signature.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/ai/concierge.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/provider", () => ({ getModel: vi.fn() }));
vi.mock("@/lib/knowledge/provider", () => ({ getKnowledgeProvider: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    aiPromptConfig: { findUnique: vi.fn() },
    aiConversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import { getKnowledgeProvider } from "@/lib/knowledge/provider";
import { prisma } from "@/lib/db/client";
import { getConciergeResponse } from "./concierge";

describe("getConciergeResponse", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(getModel)
      .mockReset()
      .mockReturnValue("fake-model" as never);
    vi.mocked(getKnowledgeProvider).mockReset();
    vi.mocked(prisma.aiPromptConfig.findUnique).mockReset();
    vi.mocked(prisma.aiConversation.findFirst).mockReset();
    vi.mocked(prisma.aiConversation.create).mockReset();
    vi.mocked(prisma.aiConversation.update).mockReset();
  });

  it("uses the configured prompt, model, temperature, and max_tokens, and creates a new conversation", async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue({
      id: "p1",
      key: "concierge-system-prompt",
      prompt_text: "You are Acme Corp support.",
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 300,
      version: 2,
      created_at: new Date(),
      updated_at: new Date(),
    } as never);
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi
        .fn()
        .mockResolvedValue([
          { content: "Acme sells widgets.", source: "pages" },
        ]),
    });
    vi.mocked(generateText).mockResolvedValue({
      text: "We sell widgets!",
    } as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue(null);

    const result = await getConciergeResponse("session-1", "What do you sell?");

    expect(result).toEqual({ reply: "We sell widgets!" });
    expect(getModel).toHaveBeenCalledWith("gpt-4o-mini");
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "fake-model",
        system: expect.stringContaining("You are Acme Corp support."),
        prompt: "What do you sell?",
        temperature: 0.3,
        maxTokens: 300,
      }),
    );
    const systemPrompt = vi.mocked(generateText).mock.calls[0][0]
      .system as string;
    expect(systemPrompt).toContain("Acme sells widgets.");
    expect(prisma.aiConversation.create).toHaveBeenCalledWith({
      data: {
        session_id: "session-1",
        messages: [
          { role: "user", content: "What do you sell?" },
          { role: "assistant", content: "We sell widgets!" },
        ],
      },
    });
  });

  it("falls back to a default system prompt and no model override when no config row exists", async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue(null);
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi.fn().mockResolvedValue([]),
    });
    vi.mocked(generateText).mockResolvedValue({ text: "Hi there." } as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue(null);

    await getConciergeResponse("session-2", "Hello");

    expect(getModel).toHaveBeenCalledWith(undefined);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: undefined, maxTokens: undefined }),
    );
    const systemPrompt = vi.mocked(generateText).mock.calls[0][0]
      .system as string;
    expect(systemPrompt).toContain("helpful concierge assistant");
  });

  it("appends to an existing conversation instead of creating a new one", async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue(null);
    vi.mocked(getKnowledgeProvider).mockReturnValue({
      getRelevantKnowledge: vi.fn().mockResolvedValue([]),
    });
    vi.mocked(generateText).mockResolvedValue({
      text: "Second reply.",
    } as never);
    vi.mocked(prisma.aiConversation.findFirst).mockResolvedValue({
      id: "c1",
      session_id: "session-3",
      messages: [
        { role: "user", content: "First message" },
        { role: "assistant", content: "First reply." },
      ],
      created_at: new Date(),
    } as never);

    await getConciergeResponse("session-3", "Second message");

    expect(prisma.aiConversation.create).not.toHaveBeenCalled();
    expect(prisma.aiConversation.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: {
        messages: [
          { role: "user", content: "First message" },
          { role: "assistant", content: "First reply." },
          { role: "user", content: "Second message" },
          { role: "assistant", content: "Second reply." },
        ],
      },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/ai/concierge.test.ts`
Expected: FAIL with "Failed to resolve import './concierge'" (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/ai/concierge.ts
import { generateText } from "ai";
import { getModel } from "@/lib/ai/provider";
import { getKnowledgeProvider } from "@/lib/knowledge/provider";
import { prisma } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// The one AiPromptConfig row this reads — matches the example key shown as
// placeholder text in app/admin/(shell)/ai/prompts/page.tsx. Create it via
// that admin page before expecting anything other than the default prompt
// and provider-default model below.
const CONCIERGE_PROMPT_KEY = "concierge-system-prompt";

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful concierge assistant for this website. Answer using the provided context when relevant, and say so plainly if you do not know.";

export interface ConciergeResult {
  reply: string;
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
  });

  const knowledge =
    await getKnowledgeProvider().getRelevantKnowledge(userMessage);
  const context = knowledge.map((chunk) => `- ${chunk.content}`).join("\n");

  const systemPrompt = [
    promptConfig?.prompt_text ?? DEFAULT_SYSTEM_PROMPT,
    context ? `Context:\n${context}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  const { text } = await generateText({
    model: getModel(promptConfig?.model ?? undefined),
    system: systemPrompt,
    prompt: userMessage,
    temperature: promptConfig?.temperature ?? undefined,
    maxTokens: promptConfig?.max_tokens ?? undefined,
  });

  const existing = await prisma.aiConversation.findFirst({
    where: { session_id: sessionId },
    orderBy: { created_at: "desc" },
  });
  const priorMessages: Prisma.JsonArray = Array.isArray(existing?.messages)
    ? existing.messages
    : [];
  const nextMessages: Prisma.JsonArray = [
    ...priorMessages,
    { role: "user", content: userMessage },
    { role: "assistant", content: text },
  ];

  if (existing) {
    await prisma.aiConversation.update({
      where: { id: existing.id },
      data: { messages: nextMessages },
    });
  } else {
    await prisma.aiConversation.create({
      data: { session_id: sessionId, messages: nextMessages },
    });
  }

  return { reply: text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/ai/concierge.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/ai/concierge.ts lib/ai/concierge.test.ts
git commit -m "feat: add concierge orchestration (prompt config + knowledge + model + conversation log)"
```

---

### Task 4: Concierge API route

**Files:**

- Create: `app/api/concierge/route.ts`
- Test: `app/api/concierge/route.test.ts`

**Interfaces:**

- Consumes: `getConciergeResponse(sessionId: string, userMessage: string): Promise<{ reply: string }>` (Task 3).
- Produces: `POST` handler at `/api/concierge` accepting `{ sessionId: string, message: string }`, returning `{ reply: string }` on success or `{ error: string }` with status 400 on invalid input. Task 5 (the dummy page) calls this exact route.

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/concierge/route.test.ts
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
    vi.mocked(getConciergeResponse).mockResolvedValue({ reply: "Hello!" });

    const response = await POST(
      makeRequest({ sessionId: "abc", message: "Hi" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: "Hello!" });
    expect(getConciergeResponse).toHaveBeenCalledWith("abc", "Hi");
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/api/concierge/route.test.ts`
Expected: FAIL with "Failed to resolve import './route'" (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```typescript
// app/api/concierge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getConciergeResponse } from "@/lib/ai/concierge";

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

  const result = await getConciergeResponse(sessionId, message);
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run app/api/concierge/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add app/api/concierge/route.ts app/api/concierge/route.test.ts
git commit -m "feat: add POST /api/concierge endpoint"
```

---

### Task 5: Dummy manual-verification page (not committed)

**Files:**

- Create: `app/dev/concierge-test/page.tsx`

**Interfaces:**

- Consumes: `POST /api/concierge` (Task 4) via `fetch`.
- Produces: nothing consumed by later tasks — this is the last task, and it is a manual, human-in-the-browser check, not an automated one. No test file for this task.

- [ ] **Step 1: Write the page**

```typescript
// app/dev/concierge-test/page.tsx
'use client'

// Throwaway manual verification page — proves the concierge chain (Payload
// content -> knowledge provider -> AiPromptConfig settings -> LLM call ->
// AiConversation log) actually works end-to-end. Not part of the toolkit's
// real surface area: no admin auth gate, no design polish, not linked from
// anywhere. Per the plan this came from, this file is intentionally left
// untracked — do not `git add` it.
import { useState } from 'react'

export default function ConciergeTestPage() {
  const [sessionId] = useState(() => crypto.randomUUID())
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function send() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Request failed')
        return
      }
      setReply(data.reply)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Concierge concept check</h1>
      <p>Session: {sessionId}</p>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        style={{ width: '100%' }}
        placeholder="Ask something a published page would answer"
      />
      <button onClick={send} disabled={loading || !message.trim()}>
        {loading ? 'Sending...' : 'Send'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {reply && (
        <div>
          <strong>Reply:</strong>
          <p>{reply}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manually verify in the browser**

Before this step, in `/admin/ai/prompts`, create a prompt with key `concierge-system-prompt` (any system prompt text, optionally a model/temperature/max_tokens), and in `/admin/cms`, publish at least one `pages` document with real body content.

Run: `pnpm dev`, navigate to `http://localhost:4000/dev/concierge-test`, type a question related to the published page's content, click Send.

Expected: a reply comes back referencing the published page's content (proves the knowledge provider read real Payload data), and a new row appears in `/admin/ai/conversations` (proves the conversation log write path works).

- [ ] **Step 3: Leave untracked — do not commit**

```bash
git status --short app/dev/
```

Expected: `?? app/dev/` (untracked). Do **not** run `git add` on this path. If a later `git add -A` elsewhere in this session would sweep it in, `git reset app/dev/` before committing.

---

## Stop here

Tasks 1–4 are real, committed chassis features (the knowledge provider implementation, the concierge orchestration function, and the `/api/concierge` endpoint a future chat UI will call). Task 5 is a manual check only.

**Do not proceed to building a chat UI.** That's the user's own work, per their plan item 2 — this plan produces the endpoint it will call (`POST /api/concierge`), not the UI itself.

**Do not start on AI prompt version history/switching** (plan item 3) from this plan. That item has an open build-vs-third-party decision (extend `AiPromptConfig` with real version history + an "active version" switch, vs. adopt an external prompt-management platform like Langfuse/PromptLayer/LangSmith) that hasn't been made yet, and per this project's own architecture (`docs/decisions.md`: one Postgres instance, no cross-store friction, pluggable-but-self-hosted) a build-first recommendation is likely — but that recommendation needs to be confirmed with the user and turned into its own plan once item 2's chat UI is done, not bundled into this one.
