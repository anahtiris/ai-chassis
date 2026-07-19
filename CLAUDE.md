# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fork-and-customize starter template ("chassis"), not a product to ship as-is and not a multi-tenant SaaS. Each client project clones this repo, customizes the business-specific parts, and keeps the underlying base. It provides: a CMS (Payload) for content, a pluggable AI-concierge layer grounded in that content, and a domain-agnostic admin backend (AI prompt management, conversation review, form results, audit log, analytics, users/permissions). It deliberately does **not** generalize arbitrary business-entity CRUD — a project's own domain objects get built on top, per fork.

Read `README.md` first for full setup steps and current status, and `docs/decisions.md` for the reasoning behind every non-obvious architectural choice below — it's a living decisions log, appended not rewritten, and is the source of truth when this file and the code seem to disagree.

## Commands

```bash
pnpm dev                          # next dev -p 4000
pnpm build                        # next build
pnpm lint                         # eslint .
pnpm typecheck                    # tsc --noEmit
pnpm test                         # vitest run
pnpm prisma:generate               # prisma generate --schema=prisma/schema.prisma
pnpm prisma:migrate                # prisma migrate dev --schema=prisma/schema.prisma
pnpm payload:migrate:create         # payload migrate:create (Payload's own migration system)
pnpm payload:migrate                # payload migrate
pnpm seed:admin <email> <password>  # tsx scripts/seed-admin.ts — creates/bootstraps the first admin login
pnpm storybook                     # storybook dev -p 6006
pnpm build-storybook
```

Run a single vitest file/test the normal vitest way, e.g. `pnpm vitest run path/to/file.test.ts -t "name"`.

### First-time local setup — order matters

```bash
createdb ai_chassis_dev
psql ai_chassis_dev -c "CREATE SCHEMA IF NOT EXISTS app;"
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET, PAYLOAD_SECRET
cp .env.local .env           # Prisma's CLI only reads .env, not .env.local
pnpm install
pnpm prisma:generate
pnpm prisma:migrate           # MUST run before any Payload command touches the DB
pnpm payload generate:importmap
pnpm seed:admin you@example.com 'a-real-password'
pnpm dev
```

`prisma:migrate` must run before any Payload command touches a fresh database, or Prisma's one-time "is this database empty" check gets tripped by Payload's tables landing in `public` and fails with P3005 (see `docs/decisions.md` "Known issues" for the full mechanism and the recovery trap to avoid if it happens anyway). This only matters once, on the very first migration.

## Architecture

### Two data layers, one Postgres instance

- **Payload CMS** — content (`Pages`, `Posts`, `Categories`, `Media`, `Users`), mounted in Postgres's default `public` schema (`payload.config.ts`). Admin UI lives at `/admin/cms`, not `/admin` (that's this toolkit's own portal — see below).
- **Prisma** — everything domain-agnostic-but-not-content: `User`/`UserPermission`, `AuditLog`, `FormSubmission`, `AiPromptConfig`, `AiConversation`, `AnalyticsSnapshot` (`prisma/schema.prisma`), scoped to Postgres's `app` schema via `datasource.schemas`.

Both run against the same Postgres instance/connection string deliberately — no cross-store friction, one migration history per ORM. A project's own business-entity models go into `prisma/schema.prisma`'s `app` schema alongside the existing models, not into new Payload collections, unless the data is genuinely content.

### Auth: one session, per-area authorization

- `auth.ts` — Auth.js v5 (NextAuth), JWT session strategy. Two providers: `Credentials` (bcrypt against `User.password_hash`, the default, zero external setup) and `MicrosoftEntraID` (optional; unset env vars just leave it unused). Its `signIn` callback implements **bootstrap**: if `User` table is empty, the first successful sign-in from *either* provider auto-creates the row with `is_owner: true`; after that, unrecognized emails are rejected rather than auto-provisioned.
- `proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts` and moved it to the Node runtime) — gates all of `/admin/*` except `/admin/login` behind a valid session.
- `lib/auth/permissions.ts`'s `hasPermission(userId, permission)` — the one shared *authorization* check, separate from session *verification* in `auth.ts`. `is_owner` is a full bypass (there is no fixed permission enum to "grant all of" — see the `UserPermission` model comment in `prisma/schema.prisma`); everyone else needs an active, non-expired `UserPermission` row for that exact permission string.
- **Payload/Auth.js SSO bridge**: `lib/payload/authStrategy.ts` gives Payload a custom `AuthStrategy` that reads the *same* Auth.js session cookie via `next-auth/jwt`'s `getToken()` (not hand-parsed), so signing in once at `/admin/login` also authenticates `/admin/cms`. Payload's local password auth is disabled on `users` (`lib/payload/collections/users.ts`); that collection exists only because Payload requires some auth collection to attach admin sessions to.

When adding a new admin-gated page/route: check `hasPermission()` server-side with a permission string specific to that area (follow the existing `AUDIT_LOG_ACCESS` / `FORM_RESULTS_ACCESS` / `AI_MANAGEMENT` / `ANALYTICS_ACCESS` pattern), don't add a new fixed role/permission enum anywhere.

### Admin portal shape

- `app/admin/(shell)/` — a Next.js route group wrapping every real admin page in `AdminShell` (`components/admin/AdminShell.tsx`: fixed sidebar + top navbar, nothing more). `/admin` (the hub), `/admin/login`, and `/admin/settings` live outside this group deliberately and are never wrapped.
- Nav items are computed server-side via `hasPermission()` per destination before `AdminShell` renders. Hub cards (`app/admin/page.tsx`'s `CARDS`) are **not** permission-gated — all are "any signed-in admin" destinations, per `docs/decisions.md` "Hub simplification: 4 cards, not 7".
- Six admin pages exist today: users, audit-logs, form-results, ai/prompts, ai/conversations, analytics. Adding a seventh follows the same shape: a page under `(shell)/`, a permission string, a nav entry.
- `app/admin/users` includes an owner-only "Add user" form (creates a `User` row directly via Prisma with a required password — an account with no local password can only sign in via Entra ID, so making it optional would produce accounts unable to sign in by either path if Entra ID isn't configured).
- `app/admin/settings` — personal-account settings, reached from the hub's "Settings" card, not permission-gated (every signed-in user, not an admin area). Currently just change-password, scoped to accounts with a non-null `password_hash`; Entra ID-only accounts see an explanatory message instead of a form (see `docs/decisions.md` "Change-password settings page").

### AI layer: two pluggable seams

- `lib/ai/provider.ts`'s `getModel()` — selects an LLM by `AI_PROVIDER` env var (Vercel AI SDK `LanguageModel`). Add a provider by installing its `@ai-sdk/*` package and adding a case; nothing calling `getModel()` changes.
- `lib/knowledge/provider.ts`'s `getKnowledgeProvider()` — selects between `DirectInjectionProvider` (default, currently an unimplemented scaffold — `TODO` per project) and `RagProvider` (`RAG_ENABLED=true`, pgvector via `payloadcms-vectorize`, queries the `content` knowledge pool registered in `payload.config.ts`). There is **no concierge chat endpoint built yet** — `getKnowledgeProvider()` has no caller in this toolkit; building one is real, separate feature work, not a port of anything existing.
- Turning RAG on requires: the Postgres `vector` extension installed on the server (not just enabled in SQL), `RAG_ENABLED=true` + a real `OPENAI_API_KEY`, and a fresh `pnpm payload:migrate:create && pnpm payload:migrate` (Payload's migration system, separate from Prisma's). See README "RAG (opt-in)" for the full sequence and how to confirm jobs are actually draining via the `payload-jobs` collection.

### UI components

`components/ui/*` is a hand-written shadcn/ui "new-york"-style kit (Button, Card, Badge, Input, Label, Textarea, Table, Checkbox, Tag, Popover, plus a custom `Dropdown` combobox) using semantic Tailwind v4 tokens (`bg-primary`, etc.) from `app/globals.css` — re-theming a fork means editing token values there, never touching component files. Every component has stories under `stories/ui/*.stories.tsx` (Storybook 10, `@storybook/nextjs-vite`). `.storybook/preview.tsx` imports `app/globals.css` — if stories ever render unstyled, check that import survived.

### Tailwind: one theme per section, not one global stylesheet

`app/layout.tsx` (the true root, wrapping everything) imports **no CSS** — it's a bare shell. Each section imports its own Tailwind entry from its own layout instead, since Next's App Router allows global CSS imports from any `layout.*` file, not just root:

- `app/admin/layout.tsx` and `app/(payload)/layout.tsx` **both** import `app/globals.css` — the admin portal and Payload's own `/admin/cms` deliberately share one theme (same file, deduped by Next, not two copies). This is also how Tailwind-based custom Payload components (`BackToHubButton`, etc.) get styled.
- A future public content section should get its **own** CSS file (e.g. `app/content.css`) and its own route-group layout importing it, independent `@theme` from admin/Payload's. Not built yet — no public content routes exist (see below).

See `docs/decisions.md` "Separate Tailwind themes per section" for why (including a confirmed pre-existing quirk: Payload's `RootLayout` renders its own nested `<html>`/`<body>` inside the root layout's — browsers tolerate it, but it causes real React hydration warnings in dev, unrelated to CSS and not yet fixed).

### Analytics

`/admin/analytics` reads only `AnalyticsSnapshot`, populated by a nightly job (`app/api/cron/analytics/route.ts`, scheduled in `vercel.json`, always UTC — reconcile with `ANALYTICS_TIMEZONE` per project). The dashboard must never read live tables directly; add new metrics as new `metric_key` values in the cron route, not new models.

### i18n

`lib/i18n.ts` + `messages/en/*.json` — a namespace-scoped JSON catalog (`admin`, `common`) with humanize-on-miss fallback. Add locales by adding catalog files; the lookup function itself shouldn't need to change.

### OpenAPI docs

`/admin/api-docs` renders `swagger-ui-dist` against `/api/openapi.json`, backed by `lib/openapi/spec.ts` — currently a genuine empty starter (no paths). Add entries there as a fork builds its own `/api/v1/**` routes. `next.config.ts` needs `serverExternalPackages: ['swagger-ui-dist']` — bundling that package breaks its `__dirname`-based asset resolution.

## Known constraints worth checking before assuming otherwise

- Prisma's `datasource.schemas = ["app"]` does not stop its first-migration emptiness check from scanning the whole database (including Payload's `public` tables) — see `docs/decisions.md` "Known issues" before changing migration order or tooling.
- `lib/knowledge/provider.ts`'s `DirectInjectionProvider` is an intentional `TODO` stub, not a bug.
- RAG (`RagProvider`) typechecks against the real published `payloadcms-vectorize` package but has never been run end-to-end against a live Postgres with `vector` installed.
- No public content routes exist yet (`app/page.tsx` is the only page outside `/admin/*`) — Payload live preview was deliberately not wired up for this reason.
- `/admin/cms` logs real React hydration warnings/errors in dev (nested `<html>`/`<body>` — Payload's `RootLayout` renders its own inside the app's root layout). Pre-existing, confirmed by reading `@payloadcms/next`'s source, not caused by the Tailwind wiring above — flagged, not yet fixed.
