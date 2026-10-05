# ai-chassis

A fork-and-customize starter template for building AI-concierge-powered
content sites: a CMS for content, an AI concierge chat widget grounded in
that content, and an admin backend to run it — AI prompt management,
conversation review, form results, audit log, analytics, and
users & permissions.

## What this is

A "chassis" you build a client-specific product on top of, repeatedly. Clone
it per project, customize the business-specific parts, keep the underlying
base.

## What this deliberately is NOT

- Not a multi-tenant SaaS product — no tenant isolation, no shared
  multi-customer deployment, no billing. One deployment per project.
- Not a generic admin-CRUD generator — it doesn't try to templatize
  arbitrary business entities. A project's own domain objects get built on
  top, per project.
- Not tied to a single auth provider, storage provider, or AI
  knowledge-retrieval strategy — those are meant to be swappable.
- Not tied to a single LLM provider — `lib/ai/provider.ts`'s `getModel()`
  switches between OpenAI, Groq, Google, OpenRouter, or a local Ollama model
  via one env var, independent of which knowledge-retrieval strategy is
  active.
- Not built around a single ORM/data layer — Payload (content) and Prisma
  (everything else) are deliberately kept separate, sharing one Postgres
  instance rather than being merged into one data layer.

## Getting started

Create the database and Prisma's `app` schema first (Payload uses Postgres's
default `public` schema). `ai_chassis_dev` below is just an example name —
pick whatever fits your project, as long as it matches `DATABASE_URL` in the
env files you set up next:

```bash
createdb ai_chassis_dev
psql ai_chassis_dev -c "CREATE SCHEMA IF NOT EXISTS app;"
```

Then, in this exact order — **`prisma:migrate` must run before any Payload
command touches this database**, or Prisma's first-migration "is this
database empty" check gets tripped by Payload's tables in `public` and
fails with P3005. This only matters for the very first migration ever; once
Prisma has migration history, order stops mattering.

```bash
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET, PAYLOAD_SECRET
cp .env.local .env           # Prisma's CLI only reads .env, not .env.local
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm payload:migrate              # creates Payload's own tables — REQUIRED (see below)
pnpm payload generate:importmap   # generates Payload's admin mount point
pnpm seed:admin you@example.com 'a-real-password'   # first admin login
pnpm dev
```

`pnpm payload:migrate` is not optional: Payload's dev-mode schema auto-push
(`pushDevSchema`) is **disabled** (`push: false` in `payload.config.ts`), so
Payload's tables are only ever created/updated by running its migrations —
they will not appear just from `pnpm dev`.

**After changing any Payload collection/field** (or pulling changes that do),
regenerate and apply a migration — this replaces what auto-push used to do
silently:

```bash
pnpm payload:migrate:create   # generates a migration from the current config
pnpm payload:migrate          # applies it
```

Then sign in at `/admin/login` with whatever email/password you just
seeded. External identity providers are all optional — see "Identity
providers (opt-in)" below.

Seed a few sample CMS documents to see the public site + AI concierge end to
end:

```bash
pnpm seed:content   # 3 pages (home/about/contact) + 1 blog post, idempotent
```

If you're pulling in the `AnalyticsSnapshot` model after your first
migration, run `pnpm prisma:migrate` again to pick it up, then trigger the
nightly job manually to see data on `/admin/analytics` (Vercel Cron only
fires on an actual Vercel deployment):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:4000/api/cron/analytics
```

## Scope

The admin portal is intentionally scoped to what's genuinely domain-agnostic:
content (via the CMS), AI prompt management, AI conversation review, form
results, audit log, analytics, and users/permissions. It does not attempt to
generalize arbitrary business-entity CRUD.

## Core design decisions

- **Deployment model:** fork-and-customize per project, not multi-tenant SaaS.
- **Database:** one Postgres instance shared by the CMS and the app layer —
  no separate content-only data store.
- **Auth/permission checks:** implemented once, shared by the CMS and the
  admin routes — not ported twice into two trees.
- **AI knowledge layer:** pluggable — direct content injection by default
  (simplest, cheapest, right choice for small content volumes), RAG as an
  opt-in upgrade once content volume grows past what comfortably fits in a
  prompt.
- **Storage:** local disk by default; set `STORAGE_BUCKET` (+ credentials) to
  switch Media uploads to any S3-compatible provider instead (AWS S3, R2,
  Spaces, MinIO) — see `.env.example`'s `STORAGE_*` vars.
- **RBAC:** a generic role/permission shape, not hardcoded to a fixed set of
  roles.

## Features reference

- **Auth:** Auth.js v5, Credentials (email/password) as the default admin
  login, plus any number of optional external IdPs — Microsoft Entra ID has a
  dedicated provider, and one generic OIDC entry covers Keycloak, Authentik,
  Okta, Auth0, Google Workspace and anything else OIDC-compliant. See
  "Identity providers (opt-in)" below. First user to sign in against an empty
  database is auto-provisioned as owner; everyone after needs an existing
  `User` row.
- **Admin portal:** `/admin` hub linking to seven permission-gated pages —
  users, audit-logs, form-results, ai/prompts, ai/conversations, ai/content,
  analytics — plus Storybook and API Docs links and personal account
  settings.
  `/admin/users` supports per-user profile/permission editing and soft
  delete; owner accounts are editable only by themselves. Every
  create/edit/delete/grant/revoke writes an `AuditLog` entry.
- **AI prompt management:** `/admin/ai/prompts` — each save is an immutable
  `AiPromptConfigVersion` snapshot, with diff/rollback via
  `/admin/ai/prompts/[key]`. Every recorded conversation stamps the exact
  version that served it, for reproducibility.
- **AI concierge:** `lib/ai/concierge.ts`'s `getConciergeResponse()` grounds
  replies in the active knowledge provider (direct injection by default, RAG
  opt-in — see below), with an optional live web search fallback for queries
  the knowledge provider finds nothing for (set `WEB_SEARCH_PROVIDER` and
  credentials, unset by default — see `.env.example`). Also supports
  generative-ui-kit tool-calling (table/dashboard/form/question/diagram).
  Tool-calling reliability depends on the underlying model. Visitors stay
  anonymous — there is no login on the public site — but the conversation a
  request may touch is decided by the server, not the caller: `/api/concierge`
  issues an HMAC-signed `httpOnly` session cookie (`lib/ai/sessionCookie.ts`,
  signed with `AUTH_SECRET`) and ignores any `sessionId` in the request body.
  An absent, forged, or stale-secret cookie starts a fresh conversation rather
  than resuming an existing one, so rotating `AUTH_SECRET` orphans in-flight
  conversations by design.
- **AI content generation:** `/admin/ai/content` — give it a topic, it
  generates a draft blog post (title, meta description, headed sections) via
  `lib/ai/contentGenerate.ts` and creates it as a **draft** Post for review
  in `/admin/cms` — never published automatically. Uses the
  `content-generator-system-prompt` `AiPromptConfig` if one exists (same
  editable-without-code mechanism as the concierge's prompt), otherwise a
  generic default.
- **CMS:** Pages, Posts, Categories, Media in `/admin/cms`, with SEO fields,
  versioned drafts, and per-document AI Concierge suggestion overrides.
  Public routes render published content under `app/(app)/(site)/` with a
  floating concierge widget where enabled. Single sign-on: signing in at
  `/admin/login` also authenticates `/admin/cms`, no separate Payload login.
  Optional social webhook: set `SOCIAL_PUBLISH_WEBHOOK_URL` to POST a
  title/url/excerpt payload on publish, for an external tool (Zapier, Make,
  n8n) to fan out to social platforms — unset by default, no per-platform
  OAuth in this app.
- **Plugins:** redirects, nested categories (with breadcrumbs), search index
  over posts, and a visual form builder — submissions from either the
  form-builder or a page's attached form land in the same
  `/admin/form-results` table.
- **Analytics:** `/admin/analytics` reads only from `AnalyticsSnapshot`,
  populated by a nightly cron job — the dashboard never queries live tables
  directly.
- **UI kit:** Tailwind v4 + a hand-written shadcn/ui-style component kit
  (`components/ui/`), with Storybook stories for every primitive.

### Identity providers (opt-in)

Credentials (email/password) is the default and needs no setup. Each
external IdP is added by env var alone — no code change, and each one only
appears as a button on `/admin/login` once configured.

**Microsoft Entra ID** keeps its own dedicated provider, because Auth.js's
built-in handles Entra-specific quirks a generic OIDC entry can't (it
rewrites the `{tenantid}` placeholder in Entra's discovery document, requests
the `User.Read` scope, and inlines the Graph profile photo):

```bash
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
```

**Everything else OIDC-compliant** — Keycloak, Authentik, Okta, Auth0,
Zitadel, Google Workspace — goes through one generic entry. Only the issuer
changes:

```bash
AUTH_OIDC_ISSUER=https://keycloak.example.com/realms/my-realm
AUTH_OIDC_ID=
AUTH_OIDC_SECRET=
AUTH_OIDC_NAME=Sign in with Keycloak   # button label, optional
```

The callback URL to register with the IdP is
`<NEXT_PUBLIC_SERVER_URL>/api/auth/callback/oidc`. To wire up a second
generic IdP, copy the block in `auth.ts` with a different `id` — the id is
part of the callback URL and is stored in `UserIdentity.provider`, so it has
to stay stable once anyone has signed in with it.

**Account linking.** Sign-ins are matched to a `User` by the IdP's own
immutable subject id, stored in `UserIdentity` — not by email. Email is used
exactly once, to link an IdP account to an already-provisioned `User` the
first time it signs in, and only when the claim is trustworthy: the provider
asserted `email_verified`, or the provider is listed in
`AUTH_TRUSTED_EMAIL_PROVIDERS` (comma-separated, defaults to
`microsoft-entra-id`, which emits no `email_verified` claim but is
tenant-scoped and operator-controlled). Without this, any configured IdP
could assert an owner's address and take over that account. Existing Entra
users predating the `UserIdentity` table are linked automatically on their
next sign-in. Completing OAuth still never auto-provisions a new account —
the `User` row must already exist, seeded or created in `/admin/users`.

### Request size limits

One concierge message is capped at 2000 characters, overridable per
environment with `CONCIERGE_MAX_MESSAGE_CHARS`. The cap exists to bound abuse,
not to tune answers — a long paragraph is around 800 characters, so a real
visitor should never meet it.

It is counted in characters, not tokens: `AI_PROVIDER` decides the tokenizer,
so an accurate token count would be both expensive and wrong the moment the
provider changes, and characters are already the unit conversation memory
budgets history in. Weigh two things before raising it. Non-Latin scripts cost
far more tokens per character (2000 characters is roughly 500 tokens of
English but closer to 1500-2000 of Thai), and the **Window** memory strategy
keeps `keepRecentTurns` messages verbatim with no budget of its own, so this
cap effectively bounds history at about half that turn count multiplied by it.
The ceiling that actually bites is usually the model's context window, which
on the default local setup is small — `lib/ai/provider.ts` does not set
Ollama's `num_ctx`.

A coarser bound derived from the same setting rejects oversized request bodies
on `content-length` before they are parsed, since App Router route handlers
have no default body size limit. A body sent without a `content-length`
(chunked) still reaches the parser.

### Conversation memory (opt-in)

By default the concierge is stateless: it sees only the current message.
Turn memory on at `/admin/cms` → Globals → AI Concierge → Conversation
memory. Three strategies:

- **None** (default) — current message only. No history is sent.
- **Window** — the most recent N messages verbatim. No extra model call,
  deterministic, free. Stored history is never rewritten, so
  `/admin/ai/conversations` keeps the full transcript either way.
- **Summary** — once history passes the character budget, the oldest
  messages are folded into a rolling summary and stop being sent. Costs one
  extra model call, and only on the turn that crosses the budget. That call
  runs _after_ the user's reply is returned, so it never adds latency to a
  response.

The summarizer reads the `chat-summarizer-system-prompt` `AiPromptConfig`
if one exists, so its wording, model and temperature are editable at
`/admin/ai/prompts` without a deploy — point it at a cheap model, since
summarizing does not need the concierge's.

`CHAT_MEMORY_STRATEGY`, `CHAT_MEMORY_KEEP_TURNS` and
`CHAT_MEMORY_MAX_CHARS` act as fallbacks for a fresh fork; anything set in
the global wins over them.

The widget stores its session id in `sessionStorage`, so a conversation
survives a page reload but not a new browsing session — history on a public
site should not follow the next visitor on a shared machine.

### RAG (opt-in)

Direct content injection is the default knowledge provider and needs none
of this. To turn RAG on:

1. Install the Postgres `vector` extension (not just enable it in SQL — the
   extension binary itself has to exist on the Postgres server). On
   Homebrew Postgres: `brew install pgvector`, then restart Postgres.
2. Set `RAG_ENABLED=true` and a real `OPENAI_API_KEY` in `.env.local`
   (embeddings reuse `AI_PROVIDER`, same as the chat model).
3. Run Payload's own migration system for the first time (separate from
   `pnpm prisma:migrate` — this only affects Payload's `public`-schema
   tables):
   ```bash
   pnpm payload:migrate:create --name enable_vectorize
   pnpm payload:migrate
   ```
4. `pnpm dev`, add content in `/admin/cms`'s `pages` collection, then check
   the `payload-jobs` collection there to confirm embedding jobs are
   actually draining.

## Repurposing this for a non-content project (sales, HR, etc.)

If a fork has no CMS content story — an internal sales tracker, an HR tool —
Payload is optional, not load-bearing. Auth.js, `hasPermission()`, the admin
portal shell, and Prisma's `app` schema are already decoupled from it; only
Payload's own `/admin/cms` surface and the AI knowledge layer depend on it.
Business entities (deals, employees, whatever) go straight into
`prisma/schema.prisma`'s `app` schema alongside `AiPromptConfig` etc.

Two levels of removal, in increasing scope:

- **Drop RAG, keep direct content injection** — small, mechanical. Delete
  `RagProvider` from `lib/knowledge/provider.ts` (and `lib/ai/embeddings.ts`,
  its only consumer), strip the `payloadcmsVectorize` block from
  `payload.config.ts`, remove `payloadcms-vectorize` /
  `@payloadcms-vectorize/pg` from `package.json`. `DirectInjectionProvider`
  has no dependency on any of this and needs no changes.
- **Drop Payload entirely** — bigger, but still mostly mechanical: delete
  `payload.config.ts`, `lib/payload/**`, `app/(payload)/**`,
  `components/payload/**`, and every `@payloadcms/*` / `payload` /
  `payloadcms-vectorize` dependency; drop the `withPayload()` wrapper in
  `next.config.ts`. `prisma/schema.prisma` and the admin portal need no
  changes. Two things aren't mechanical and need a real decision first:
  `lib/payload/hooks/bridgeFormSubmission.ts` is the only thing that writes
  Payload form-builder submissions into Prisma's `FormSubmission` table, so
  dropping Payload means finding a new public-form-submission path if forms
  still matter; and `lib/knowledge/provider.ts`'s providers both read
  Payload's `pages` collection, so the AI concierge needs a new content
  source (e.g. Prisma tables) if it's staying.
