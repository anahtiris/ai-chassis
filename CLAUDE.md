# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fork-and-customize starter template ("chassis"), not a product to ship as-is and not a multi-tenant SaaS. Each client project clones this repo, customizes the business-specific parts, and keeps the underlying base. It provides: a CMS (Payload) for content, a pluggable AI-concierge layer grounded in that content, and a domain-agnostic admin backend (AI prompt management, conversation review, form results, audit log, analytics, users/permissions). It deliberately does **not** generalize arbitrary business-entity CRUD — a project's own domain objects get built on top, per fork.

Read `README.md` first for full setup steps and current status.

**About the `docs/decisions.md` references below.** That file records the reasoning behind every non-obvious architectural choice here, but it is **not in this repository** — `docs/` is gitignored, so a fresh clone will not have it. It exists only on machines that hold a local copy. Treat the citations below as pointers for whoever has that copy, not as something you can open from a clean checkout.

Two consequences worth knowing before relying on it:

- **It stops at 2026-07-24.** Anything built after that date has no entry — live preview, S3 storage, the web-search fallback, the AI content generator, SEO generation, the social publish webhook, and pluggable OIDC providers are all undocumented there.
- **When it is absent, this file and the code are the source of truth.** Where a citation below points at a section you cannot read, the surrounding paragraph already states the conclusion; the citation only adds the reasoning behind it.

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

- `auth.ts` — Auth.js v5 (NextAuth), JWT session strategy, no adapter. Three provider slots: `Credentials` (bcrypt against `User.password_hash`, the default, zero external setup); `MicrosoftEntraID`, registered only when `AUTH_MICROSOFT_ENTRA_ID_ID` is set — kept as the dedicated built-in rather than folded into the generic entry because it rewrites the `{tenantid}` placeholder in Entra's discovery doc, requests `User.Read`, and inlines the Graph avatar; and one generic `type: "oidc"` entry (`id: "oidc"`), registered only when `AUTH_OIDC_ISSUER` is set, which covers every other OIDC IdP (Keycloak, Authentik, Okta, Auth0, Google Workspace) by env var alone. Add a second generic IdP by copying that block with a different `id` — the id is part of the callback URL and is persisted in `UserIdentity.provider`, so it must stay stable. `auth.ts` exports `oauthProviders` (id + label for the configured external IdPs); `app/(app)/admin/login/page.tsx` loops over it, so adding an IdP needs no login-page edit.
- **OAuth identity is keyed on the provider's subject id, not email.** `UserIdentity` (`prisma/schema.prisma`, unique on `(provider, provider_account_id)`) maps an IdP account to a `User`. The policy lives in `lib/auth/identity.ts`'s `resolveSignIn()` — a pure function over already-fetched facts, unit-tested in `identity.test.ts`; the `signIn` callback only fetches facts and performs the writes it returns (`allow` / `link` / `bootstrap` / `deny`). Email is a one-time linking hint, accepted only when the provider asserted `email_verified` or the provider is in `AUTH_TRUSTED_EMAIL_PROVIDERS` (default `microsoft-entra-id`). This is what stops a second, weaker IdP from asserting an owner's address and taking the account — don't reintroduce email-only matching. **Bootstrap** is one of `resolveSignIn()`'s outcomes, not a separate branch: empty `User` table means the first successful external sign-in creates the row with `is_owner: true` (still subject to the same email-trust check); after that, unrecognized emails are rejected rather than auto-provisioned. The `jwt` callback resolves `token.sub` via `UserIdentity` first and falls back to email, so an IdP-side email change doesn't break the session.
- `proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts` and moved it to the Node runtime) — gates all of `/admin/*` except `/admin/login` behind a valid session.
- `lib/auth/permissions.ts`'s `hasPermission(userId, permission)` — the one shared _authorization_ check, separate from session _verification_ in `auth.ts`. `is_owner` is a full bypass (there is no fixed permission enum to "grant all of" — see the `UserPermission` model comment in `prisma/schema.prisma`); everyone else needs an active, non-expired `UserPermission` row for that exact permission string.
- **Payload/Auth.js SSO bridge**: `lib/payload/authStrategy.ts` gives Payload a custom `AuthStrategy` that reads the _same_ Auth.js session cookie via `next-auth/jwt`'s `getToken()` (not hand-parsed), so signing in once at `/admin/login` also authenticates `/admin/cms`. Payload's local password auth is disabled on `users` (`lib/payload/collections/users.ts`); that collection exists only because Payload requires some auth collection to attach admin sessions to.

When adding a new admin-gated page/route: check `hasPermission()` server-side with a permission string specific to that area (follow the existing `AUDIT_LOG_ACCESS` / `FORM_RESULTS_ACCESS` / `AI_MANAGEMENT` / `ANALYTICS_ACCESS` / `USER_MANAGEMENT` pattern), don't add a new fixed role/permission enum anywhere.

### Admin portal shape

- `app/(app)/admin/(shell)/` — a Next.js route group wrapping every real admin page in `AdminShell` (`components/admin/AdminShell.tsx`: fixed sidebar + top navbar, nothing more). `/admin` (the hub), `/admin/login`, and `/admin/settings` live outside this group deliberately and are never wrapped.
- Nav items are computed server-side via `hasPermission()` per destination before `AdminShell` renders. Hub cards (`app/(app)/admin/page.tsx`'s `CARDS`) are **not** permission-gated — all are "any signed-in admin" destinations, per `docs/decisions.md` "Hub simplification: 4 cards, not 7".
- Seven admin pages exist today: users, audit-logs, form-results, ai/prompts, ai/conversations, ai/content, analytics. `ai/content` is gated by `AI_MANAGEMENT`, the same permission as the other two `ai/*` pages — generating draft content is an AI-management capability, not a distinct one. Adding an eighth follows the same shape: a page under `(shell)/`, a permission string, a nav entry.
- `app/(app)/admin/users` is reachable by owners **and** `USER_MANAGEMENT` holders (`canManageUsers()` in `lib/auth/permissions.ts`, not owner-only). It's a list + "Add user" form (name optional, email + required password — an account with no local password can only sign in via Entra ID, so making it optional would produce accounts unable to sign in by either path if Entra ID isn't configured). Per-user editing lives on the `app/(app)/admin/(shell)/users/[id]` subpage: profile (name/email, no password — that's self-service at `/admin/settings`), permissions (`BUILTIN_PERMISSIONS` render as checkboxes saved by one reconcile action, plus a free-text "custom permission" escape hatch for project-defined strings), and a soft-delete (sets `archived_at`). Adding a new gated area means adding its `{ key, label, description }` to `BUILTIN_PERMISSIONS` so it gets a checkbox — the `permission` column itself stays free text (no fixed enum).
- **Owner accounts are untouchable by anyone but themselves** — `canManageTarget(actor, target)` (`lib/auth/permissions.ts`) returns false when the target is an owner and the actor isn't that same owner. So an owner can edit only their own profile, no one can delete an owner, and owner rows expose no permission UI (owners bypass the permission table anyway). A user can't soft-delete themselves either (no lock-out). Every server action on the `[id]` page re-runs this authorization via a shared `loadTarget()` — server actions are independent entrypoints, not gated by the page render. Note: `USER_MANAGEMENT` deliberately DOES let a non-owner holder edit non-owners' permissions (including their own) — an accepted escalation surface, chosen over splitting user-record vs permission rights.
- `app/(app)/admin/settings` — personal-account settings, reached from the hub's "Settings" card, not permission-gated (every signed-in user, not an admin area). Currently just change-password, scoped to accounts with a non-null `password_hash`; Entra ID-only accounts see an explanatory message instead of a form (see `docs/decisions.md` "Change-password settings page").

### AI layer: three pluggable seams

- `lib/ai/provider.ts`'s `getModel()` — selects an LLM by `AI_PROVIDER` env var (Vercel AI SDK `LanguageModel`). Wired: `openai` (default), `groq`, `google` (Gemini), `openrouter`, `ollama` — the first four via free-tier API keys (see `.env.example`), `ollama` for fully local models. `openrouter` has no `@ai-sdk/*` package compatible with this project's `ai@^4` (the official one needs `ai@^6`); it's wired via `createOpenAI` pointed at OpenRouter's OpenAI-compatible endpoint instead, which is OpenRouter's own documented v4 integration path, not a workaround. Add another provider by installing its `@ai-sdk/*` package and adding a case; nothing calling `getModel()` changes.
- `lib/knowledge/provider.ts`'s `getKnowledgeProvider()` — selects between `DirectInjectionProvider` (default, fully implemented — pulls published `pages` content via Payload's local API) and `RagProvider` (`RAG_ENABLED=true`, pgvector via `payloadcms-vectorize`, queries the `content` knowledge pool registered in `payload.config.ts`). `app/api/concierge/route.ts` → `lib/ai/concierge.ts`'s `getConciergeResponse()` is the caller: it grounds the model in `getKnowledgeProvider()`'s context and resolves the active `AiPromptConfig` for system prompt/model/temperature/max_tokens.
- `lib/ai/memory/provider.ts`'s `getMemoryStrategy(settings)` — selects `NoneStrategy` (default, reproduces the original stateless behavior), `WindowStrategy` (last N messages verbatim, no model call) or `SummaryStrategy` (rolling summary once a character budget is passed). The interface deliberately splits **`prepare()` — synchronous, pure, no I/O, runs before the model call** from **`compact()` — async, may call a model, runs after the reply is returned** so summarization never delays a response. Settings come from the `AiConcierge` global's `memory` group via `lib/ai/memory/settings.ts` (env `CHAT_MEMORY_*` as fallback, then `none`); the summarizer's own prompt/model live in `AiPromptConfig` under `chat-summarizer-system-prompt`. `parseStoredHistory()` tolerates whatever is in the `messages` JSON — assistant tool-call entries carry no `content` and are dropped rather than replayed as empty strings. Unrecognized strategy values fall back to `none` rather than throwing, since they come from operator-editable settings.
- `AiConversation.session_id` is unique, and `getConciergeResponse()` reads the row **once** per turn, passing it to `appendToConversation()` rather than re-querying. `agent_key` on that model is reserved for multi-agent work — nullable, written by nothing today. Note `compact()` sees the history as of _before_ the current exchange was appended, so the budget check lags one turn; `summaryTurns` stays a valid index because appends only extend the array's tail.
- The concierge also has generative-ui-kit tool-calling wired in (`lib/ai/generativeTools.ts` bridges the kit's `tableToolDefinition`/`dashboardToolDefinition`/`formToolDefinition`/`questionToolDefinition`/`diagramToolDefinition` + handlers into AI SDK `tool()`s, single-step — no `execute`, so `generateText` returns the tool call rather than auto-running and continuing). `getConciergeResponse()` returns a discriminated `{type:"text",text}` | `{type:"tool_call",toolCallId,toolName,input,render,forModel}`; `ConciergeWidget.tsx`'s `onSend` forwards either shape as the matching `ChatStreamEvent` to `GenerativeChat`'s `defaultRenderers`. Whether a given prompt turn actually gets a tool call depends heavily on the underlying model's tool-calling reliability — verified against local Ollama models: `qwen3:14b` reliably produces well-formed tool calls, `llama3.2` calls the right tool but sometimes serializes array fields as JSON strings (a downstream renderer bug, not a route bug), `gemma4` (the provider default) tends to pick a different tool (e.g. asking a clarifying question) rather than the expected one. A strong custom system-prompt persona (e.g. "always answer in rhyme") can also suppress tool-calling entirely regardless of model.
- Turning RAG on requires: the Postgres `vector` extension installed on the server (not just enabled in SQL), `RAG_ENABLED=true` + a real `OPENAI_API_KEY`, and a fresh `pnpm payload:migrate:create && pnpm payload:migrate` (Payload's migration system, separate from Prisma's). See README "RAG (opt-in)" for the full sequence and how to confirm jobs are actually draining via the `payload-jobs` collection.

### UI components

`components/ui/*` is a hand-written shadcn/ui "new-york"-style kit (Button, Card, Badge, Input, Label, Textarea, Table, Checkbox, Tag, Popover, plus a custom `Dropdown` combobox) using semantic Tailwind v4 tokens (`bg-primary`, etc.) from `app/globals.css` — re-theming a fork means editing token values there, never touching component files. Every component has stories under `stories/ui/*.stories.tsx` (Storybook 10, `@storybook/nextjs-vite`). `.storybook/preview.tsx` imports `app/globals.css` — if stories ever render unstyled, check that import survived.

### Tailwind: one theme per section, not one global stylesheet

There is no single top-level `app/layout.tsx` — Next's App Router only allows one `<html>`/`<body>` pair per branch of the layout tree, and Payload's `RootLayout` (used directly by `app/(payload)/layout.tsx`) renders its own with no opt-out, so a single shared root would nest two `<html>`/`<body>` pairs and cause real React hydration errors. Instead this uses Next's [multiple root layouts](https://nextjs.org/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts) pattern: every non-Payload route lives under the `app/(app)/` route group, whose own `app/(app)/layout.tsx` is an independent root importing **no CSS** — a bare shell. Each section imports its own Tailwind entry from its own nested layout instead, since Next's App Router allows global CSS imports from any `layout.*` file, not just root:

- `app/(app)/admin/layout.tsx` imports `app/globals.css` (the admin portal's theme). `app/(payload)/layout.tsx` deliberately does **not** — globals.css bundles Tailwind's preflight + a base element layer (`*`, `body`, `h1-h6`) that resets margins/box-sizing/type on Payload's own chrome and breaks its layout (Payload relies on the default UA styles preflight strips). Payload styles itself via `@payloadcms/next/css`; no custom Payload component currently uses Tailwind/brand tokens (`BackToHubButton` uses Payload's own `nav__log-out` class). A future custom Payload field that needs brand tokens should get a scoped, preflight-free stylesheet, not a re-import of globals.css.
- Public content routes live under the `app/(app)/(site)/` route group: the site **root** `/` renders the `pages` doc whose slug is `/` (the landing page — `(site)/page.tsx`), `[slug]` renders every other published `pages` doc (`/about`, `/contact`), and `blog/` + `blog/[slug]` render `posts`. All three delegate to `components/site/PageView.tsx` (published-only fetch, lexical `RichText`, concierge widget). `app/(app)/(site)/layout.tsx` currently **reuses** `app/globals.css` (so content shares the admin brand tokens and picks up the generative-ui-kit theme + `@source` the on-page concierge widget needs). Per `docs/decisions.md` "Separate Tailwind themes per section" a fork can later split this into its own `content.css` + `@theme`; the starter shares globals.css to avoid a second theme up front.
- `components/concierge/ConciergeWidget.tsx` is a floating client widget the `(site)` pages render **only when** the doc's AI Concierge is enabled (`isConciergeEnabled`, page override falling back to the global). It feeds generative-ui-kit's `GenerativeChat` the doc's resolved `{ label, sampleMessage }` suggestions and posts to `/api/concierge`. Sample content (3 pages + 1 post) is created by `pnpm seed:content` (`scripts/seed-content.ts`, idempotent, via Payload's `run` command).

See `docs/decisions.md` "Separate Tailwind themes per section" and "Multiple root layouts: Payload's RootLayout can't be nested" for the full reasoning and how the hydration issue was actually fixed (previously flagged as unfixed; it's resolved now).

### Analytics

`/admin/analytics` reads only `AnalyticsSnapshot`, populated by a nightly job (`app/api/cron/analytics/route.ts`, scheduled in `vercel.json`, always UTC — reconcile with `ANALYTICS_TIMEZONE` per project). The dashboard must never read live tables directly; add new metrics as new `metric_key` values in the cron route, not new models.

### i18n

`lib/i18n.ts` + `messages/en/*.json` — a namespace-scoped JSON catalog (`admin`, `common`) with humanize-on-miss fallback. Add locales by adding catalog files; the lookup function itself shouldn't need to change.

### OpenAPI docs

`/admin/api-docs` renders `swagger-ui-dist` against `/api/openapi.json`, backed by `lib/openapi/spec.ts` — currently a genuine empty starter (no paths). Add entries there as a fork builds its own `/api/v1/**` routes. `next.config.ts` needs `serverExternalPackages: ['swagger-ui-dist']` — bundling that package breaks its `__dirname`-based asset resolution.

## Known constraints worth checking before assuming otherwise

- Prisma's `datasource.schemas = ["app"]` does not stop its first-migration emptiness check from scanning the whole database (including Payload's `public` tables) — see `docs/decisions.md` "Known issues" before changing migration order or tooling. The same whole-database scanning also affects `prisma migrate reset`: it re-triggers this check because resetting drops `app`'s own migration history, so a reset requires dropping and recreating **both** `public` and `app`, not just `app` — see `docs/decisions.md`'s follow-up note under "Known issues".
- RAG (`RagProvider`) typechecks against the real published `payloadcms-vectorize` package but has never been run end-to-end against a live Postgres with `vector` installed.
- Public content routes exist under `app/(app)/(site)/`: root `/` (landing, the slug-`/` page), `[slug]` (`/about`, `/contact`), `blog/` (index) + `blog/[slug]` (post), rendering published `pages` (via `layout` blocks — see "Collections" below) and `posts` (still a flat `richText` field) via `@payloadcms/richtext-lexical/react`'s `RichText`, with the floating `ConciergeWidget` when the doc's concierge is enabled (posts to `/api/concierge`). Sample content (3 pages + 1 post) is seeded by `scripts/seed-content.ts`, whose landing-page entry uses `slug: "/"` to match `(site)/page.tsx`'s site-root lookup (fixed after an earlier mismatch briefly created an orphan `/home` page — seeding is idempotent, safe to re-run). The old `app/(app)/page.tsx` scaffold was removed (it collided with `(site)/page.tsx` at `/`). Payload live preview is wired up (`app/api/preview`, `app/api/exit-preview`, `admin.livePreview`/`preview` on `Pages`/`Posts`). `/api/preview` is gated on `PREVIEW_SECRET` **and** an Auth.js session, not Payload's own auth — Payload's local password auth is disabled here, so `payload.auth()` would never succeed.
- The nested `<html>`/`<body>` hydration issue (Payload's `RootLayout` rendering its own inside a shared root) is fixed — see "Tailwind: one theme per section" above and `docs/decisions.md` "Multiple root layouts: Payload's RootLayout can't be nested."
