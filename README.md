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
default `public` schema):

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
seeded. Microsoft Entra ID is optional — only fill in
`AUTH_MICROSOFT_ENTRA_ID_*` if a project actually needs it.

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
- **Storage:** pluggable, S3-compatible interface, not locked to one cloud
  provider.
- **RBAC:** a generic role/permission shape, not hardcoded to a fixed set of
  roles.

## Features reference

- **Auth:** Auth.js v5, Credentials (email/password) as the default admin
  login, Microsoft Entra ID as an optional second provider. First user to
  sign in against an empty database is auto-provisioned as owner; everyone
  after needs an existing `User` row.
- **Admin portal:** `/admin` hub linking to six permission-gated pages —
  users, audit-logs, form-results, ai/prompts, ai/conversations, analytics —
  plus Storybook and API Docs links and personal account settings.
  `/admin/users` supports per-user profile/permission editing and soft
  delete; owner accounts are editable only by themselves. Every
  create/edit/delete/grant/revoke writes an `AuditLog` entry.
- **AI prompt management:** `/admin/ai/prompts` — each save is an immutable
  `AiPromptConfigVersion` snapshot, with diff/rollback via
  `/admin/ai/prompts/[key]`. Every recorded conversation stamps the exact
  version that served it, for reproducibility.
- **AI concierge:** `lib/ai/concierge.ts`'s `getConciergeResponse()` grounds
  replies in the active knowledge provider (direct injection by default, RAG
  opt-in — see below) and supports generative-ui-kit tool-calling
  (table/dashboard/form/question/diagram). Tool-calling reliability depends
  on the underlying model.
- **CMS:** Pages, Posts, Categories, Media in `/admin/cms`, with SEO fields,
  versioned drafts, and per-document AI Concierge suggestion overrides.
  Public routes render published content under `app/(app)/(site)/` with a
  floating concierge widget where enabled. Single sign-on: signing in at
  `/admin/login` also authenticates `/admin/cms`, no separate Payload login.
- **Plugins:** redirects, nested categories (with breadcrumbs), search index
  over posts, and a visual form builder — submissions from either the
  form-builder or a page's attached form land in the same
  `/admin/form-results` table.
- **Analytics:** `/admin/analytics` reads only from `AnalyticsSnapshot`,
  populated by a nightly cron job — the dashboard never queries live tables
  directly.
- **UI kit:** Tailwind v4 + a hand-written shadcn/ui-style component kit
  (`components/ui/`), with Storybook stories for every primitive.

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
