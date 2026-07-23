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

## Scope

The admin portal is intentionally scoped to what's genuinely domain-agnostic:
content (via the CMS), AI prompt management, AI conversation review, form
results, audit log, analytics, and users/permissions. It does not attempt to
generalize arbitrary business-entity CRUD.

## Repurposing this for a non-content project (sales, HR, etc.)

If a fork has no CMS content story — an internal sales tracker, an HR tool —
Payload is optional, not load-bearing. Auth.js, `hasPermission()`, the admin
portal shell, and Prisma's `app` schema are already decoupled from it; only
Payload's own `/admin/cms` surface and the AI knowledge layer depend on it.
Business entities (deals, employees, whatever) go straight into
`prisma/schema.prisma`'s `app` schema alongside `AiPromptConfig` etc. — that's
what that schema is for, per "What this deliberately is NOT" above.

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

See `docs/decisions.md` for the full reasoning behind each of these, plus
what's still open.

## Status

Boots end to end: `pnpm dev` serves Payload's admin at `/admin/cms`,
confirmed working against a real local Postgres. Next.js + Payload
(Postgres adapter, `public` schema) + Prisma (`app` schema, same instance)

- Auth.js v5, with Credentials (username/password) as the default admin
  login and Microsoft Entra ID as an optional second provider, plus a
  pluggable AI-provider abstraction (`lib/ai/provider.ts`) and
  knowledge-provider interface (`lib/knowledge/provider.ts`). `/admin/login`
  exists and `proxy.ts` correctly redirects unauthenticated `/admin/*`
  requests to it. `pnpm install` and a full `tsc --noEmit` both pass.

The first user to ever sign in (via either provider) against an empty
database is auto-provisioned as owner, bypassing the permission system
entirely; everyone after that needs a `User` row to already exist. See
`docs/decisions.md` "Bootstrap: first user is owner." Both providers have
been tested end to end against a real Azure AD app registration and a real
local Postgres. `/admin/users` (owners **and** `USER_MANAGEMENT` holders —
`canManageUsers()`) lists users and has an "Add user" form (optional name,
email + required password — an Entra ID-only account has no local password,
and making it optional here just produced accounts that couldn't sign in by
either path if Entra ID wasn't configured). Per-user editing lives on the
`/admin/users/[id]` subpage: profile (name/email — password stays self-service
at `/admin/settings`), permissions (the toolkit's built-in permissions,
`BUILTIN_PERMISSIONS` in `lib/auth/permissions.ts`, render as checkboxes saved
by one Save button; any other project-defined string can still be granted via
a free-text "custom permission" field — the `permission` column is
deliberately free text, see `prisma/schema.prisma`), and a soft-delete (sets
`archived_at`, so the user loses all access and the audit history is kept).
**Owner accounts are untouchable by anyone but themselves** (`canManageTarget`)
— an owner edits only their own profile, no one deletes an owner, and you can't
delete your own account. Every create/edit/delete/grant/revoke writes an
`AuditLog` entry.
`pnpm seed:admin` was also fixed — it failed under `tsx` with `bcryptjs does
not provide an export named 'hash'` (its CJS entry re-exports indirectly,
which `cjs-module-lexer` can't statically see through); switched to a
default import in that script only. See `docs/decisions.md` "Create-user UI

- `seed:admin` bcryptjs fix."
  `/admin/audit-logs` reads those entries back — gated by an
  `AUDIT_LOG_ACCESS` permission string, the first real (non-owner-bypass) use
  of `lib/auth/permissions.ts`'s `hasPermission()`. `/admin/form-results`
  follows the same read-only, permission-gated shape over `FormSubmission`
  (`FORM_RESULTS_ACCESS`). `/admin/ai/prompts` (create prompts and save new
  versions of `AiPromptConfig`; each save is an immutable
  `AiPromptConfigVersion` snapshot, not an overwrite) and its
  `/admin/ai/prompts/[key]` history page (diff any two versions, roll back
  by activating an older one) share an `AI_MANAGEMENT` permission with
  `/admin/ai/conversations` (read-only review of `AiConversation`).

`/admin/analytics` (gated by `ANALYTICS_ACCESS`) rounds out every
domain-agnostic admin page from "Admin portal scope" — it reads only from
`AnalyticsSnapshot`, populated by the nightly `/api/cron/analytics` job (see
`vercel.json` for the schedule, `docs/decisions.md` "Analytics" for why the
dashboard never touches live tables directly).

RAG is implemented behind `lib/knowledge/provider.ts`'s `RagProvider`
(`payloadcms-vectorize` + pgvector, opt-in via `RAG_ENABLED=true`) — see
"RAG (opt-in)" below. It's built and typechecks against the real published
package, but has not been run end to end against a live Postgres with
pgvector installed, and there's no concierge chat endpoint in this toolkit
yet to actually call it — see `docs/decisions.md`'s "Now implemented" note
under "RAG implementation" for the specific caveats.

Storybook is set up (`@storybook/nextjs-vite`, confirmed with both `pnpm
storybook` and `pnpm build-storybook` against this project's actual files —
see `docs/decisions.md` "UI components: Storybook, not a kitchen-sink page"
for why the Vite-based framework specifically) and now has real stories:
`stories/ui/*.stories.tsx` covers every `components/ui/*` primitive with
several variant/state stories each. Along the way, found that
`.storybook/preview.tsx` never actually imported `app/globals.css`, so every
story was rendering unstyled — fixed, see `docs/decisions.md` "Component
stories for the UI kit."

Tailwind v4 + a shadcn/ui-style component kit is installed
(`components/ui/`: Button, Card, Badge, Input, Label, Textarea, Table,
Checkbox, Tag, Popover, and a custom searchable `Dropdown`), de-branded from
the original project's POC — see `docs/decisions.md` "UI components: ported
from the POC, de-branded" for the full story, including why it was
hand-written rather than CLI-generated (`ui.shadcn.com` is unreachable from
the sandbox this was built in) and what that means for confidence in it.
Verified via a real `pnpm build` (Turbopack compiled successfully). Wired
into all six admin pages under `app/(app)/admin/(shell)/` — none are
inline-styled scaffolding anymore. Not done yet: a real AI chat UI (the
POC's version was a scripted mock, not something to port as-is) and public
content pages — `app/(app)/page.tsx` is still a placeholder scaffold.

`AdminShell` (`components/admin/AdminShell.tsx`) — a fixed sidebar + top
navbar, simplified from the POC's collapsible/mobile-nav version — wraps
every admin page except the `/admin` hub landing and `/admin/login`, via a
route group (`app/(app)/admin/(shell)/`) rather than a pathname check. Nav
items and hub cards are permission-gated server-side (`hasPermission()`)
before either component ever renders. A small namespace-catalog i18n helper
(`lib/i18n.ts` + `messages/en/*.json`) drives all of the labels — kept from
the POC as reusable infrastructure, repopulated with this toolkit's own
strings (no Blackatz copy carried over). `app/(app)/admin/page.tsx` is the
header

- card-grid hub landing linking out to whichever sections the signed-in
  user has access to. See `docs/decisions.md` "AdminShell: sidebar + navbar,
  nothing more" for the full reasoning. Verified via `pnpm typecheck` (only
  the known pre-existing Prisma-client error signature, nothing new) and a
  `pnpm build` Turbopack compile pass.

A generated brand theme (color scales, fonts, type scale, shadows, radius)
is now wired into `app/globals.css`'s `@theme`, and Tailwind is split per
section rather than loaded globally: there's no single top-level
`app/layout.tsx` — Payload's `RootLayout` renders its own `<html>`/`<body>`
with no opt-out, so this uses Next's [multiple root
layouts](https://nextjs.org/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts)
pattern instead. `app/(app)/layout.tsx` is an independent root for
everything except Payload, importing no CSS itself; `app/(app)/admin/layout.tsx`
and `app/(payload)/layout.tsx` both import `app/globals.css`, so the custom
admin portal and Payload's own `/admin/cms` share one theme (same file, not
duplicated). A future public content section is expected to get its own
separate CSS file and `@theme` the same way. See `docs/decisions.md`
"Separate Tailwind themes per section" and "Multiple root layouts:
Payload's RootLayout can't be nested" for the full reasoning — the nested
`<html>`/`<body>` hydration issue this surfaced is now fixed, not just
flagged.
Verified via `pnpm typecheck`, `pnpm build`, and visually in Storybook
(primary/destructive buttons render as genuinely different reds, not the
same color).

A later theme regeneration changed color/type-scale/shadow/radius values
again and raised the base font size to 18px — the whole type scale was
recomputed at the same ~1.25 ratio anchored on the new base, not just the
`base` step in isolation, so it stays a coherent progression. It also
surfaced that `/admin/cms` still rendered on a dark background: Payload's
own admin UI (`@payloadcms/ui`) uses a completely separate CSS variable
system (`--theme-elevation-*`, switched via `html[data-theme]`), untouched
by `app/globals.css`'s tokens — `payload.config.ts`'s `admin.theme` had
never been set, so it defaulted to Payload's own `'all'` (follow OS
preference). Pinned to `'light'`. Note this only fixes light-vs-dark
consistency, not brand-color alignment — Payload's native chrome still uses
its own palette. `/admin/login` (previously the original inline-styled
scaffold) was also rebuilt with the same `Card`/`Input`/`Label`/`Button`
components used elsewhere in the admin portal. See `docs/decisions.md`
"Payload's own admin theme is a separate system," "Type scale re-anchored,"
and "`/admin/login` restyled."

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
   ```
   pnpm payload:migrate:create --name enable_vectorize
   pnpm payload:migrate
   ```
4. `pnpm dev`, add content in `/admin/cms`'s `pages` collection, then check
   the `payload-jobs` collection there to confirm embedding jobs are
   actually draining (see the caveat above — this isn't guaranteed yet
   without a caller in the loop).

### Single sign-on between the admin portal and Payload

`/admin/cms` (Payload) authenticates from the same Auth.js session cookie
`/admin/*` uses — sign in once at `/admin/login` (Credentials or Entra ID)
and `/admin/cms` picks up the same identity automatically, no separate
Payload password and no create-first-user screen. See `lib/payload/
authStrategy.ts` and `docs/decisions.md` "Single sign-on: bridge Payload's
admin auth to Auth.js" for how, and why it's `next-auth/jwt`'s `getToken()`
rather than hand-parsing the cookie.

If you already had a Payload migration from before this was wired in,
generate and apply a follow-up one (the `users` collection's shape
changed — no more password columns):

```
pnpm payload:migrate:create
pnpm payload:migrate
```

### Hub, dashboard, and API docs

`/admin` is five cards — Administration, CMS, Storybook, API Docs, Settings
— all visible to any signed-in admin, no per-card permission gate (this
replaced an earlier version with one card per admin section; see
`docs/decisions.md` "Hub simplification"). Settings (`/admin/settings`)
is personal-account settings, not an admin area — currently just
change-password, and only for accounts with a local password already set
(`password_hash` non-null); Entra ID-only accounts see an explanatory
message instead of a form. See `docs/decisions.md` "Change-password
settings page." Administration opens `/admin/dashboard`, a minimal
landing page — `AdminShell`'s sidebar is the real navigation from there.
Storybook is a separate process (`pnpm storybook`), so that card is an
external link (`NEXT_PUBLIC_STORYBOOK_URL`, defaults to
`http://localhost:6006`). API Docs (`/admin/api-docs`) renders
`swagger-ui-dist` against `/api/openapi.json`, backed by `lib/openapi/
spec.ts` — a genuine starter (empty `paths`), not the POC's Blackatz-specific
API document; add entries there as this project grows its own `/api/v1/**`
routes.

Payload's own logout (`/admin/cms`) now just links back to `/admin` instead
of Payload's default behavior, which didn't do anything meaningful once
`/admin/cms` authenticates via the Auth.js session bridge above.

### Content: Pages, Posts, Categories, Media

Four collections in `/admin/cms`, all generic CMS infrastructure — no
business-specific page-builder blocks (see `docs/decisions.md` "Collections:
generic infrastructure only" for what was deliberately left out and why).
Pages and Posts both get SEO fields, versioned drafts, and an AI Concierge
suggestion override (site-wide defaults live in the `aiConcierge` global,
per-document overrides seed from those defaults on creation — see
`lib/payload/concierge/`). Each suggestion is `{ label, sampleMessage }`,
matching generative-ui-kit's `Suggestion` type: `label` is the chip text,
`sampleMessage` (optional) is what gets sent to the concierge on click
(falls back to the label when blank), so a short chip can trigger a fuller
question. Live preview isn't wired up — it needs a public
content route this toolkit doesn't have yet.

If you already ran a Payload migration before this, generate and apply a
follow-up one:

```
pnpm payload:migrate:create
pnpm payload:migrate
```

### Redirects, nested categories, search, and forms

Four more official Payload plugins, all registered in `payload.config.ts`:
`redirectsPlugin` (a `redirects` collection pointing at `pages`/`posts`),
`nestedDocsPlugin` (parent/breadcrumbs on `Categories`), `searchPlugin` (a
search-index mirror over `Posts`, `lib/payload/search/`), and
`formBuilderPlugin` (visual form builder, payment fields disabled).

Form-builder ships its own `form-submissions` collection — rather than
leaving that as a second, disconnected place submissions land alongside the
existing Prisma `FormSubmission` model (`/admin/form-results`),
`lib/payload/hooks/bridgeFormSubmission.ts` mirrors every submission into
that same table on create. `/admin/form-results` stays the one place to
check, regardless of which system captured a submission. See
`docs/decisions.md` "Four more Payload plugins" for the full reasoning.

### Getting started

Create the database and Prisma's `app` schema first (Payload uses Postgres's
default `public` schema — see `docs/decisions.md` "Known issues" for why we
don't fight that with a custom schema name):

```bash
createdb ai_chassis_dev
psql ai_chassis_dev -c "CREATE SCHEMA IF NOT EXISTS app;"
```

Then, in this exact order — **`prisma:migrate` must run before any Payload
command touches this database**, or Prisma's first-migration "is this
database empty" check gets tripped by Payload's tables in `public` and
fails with P3005. This only matters for the very first migration ever; once
Prisma has migration history, order stops mattering. See `docs/decisions.md`
for the full explanation.

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
they will not appear just from `pnpm dev`. Auto-push was turned off on
purpose: with no custom `schemaName` set it introspected the whole database
on every Payload init and dropped into an interactive "create or rename?"
prompt on any drift, which hangs a non-interactive dev server for minutes.
See `docs/decisions.md` "Known issues" for the full mechanism.

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

If you're pulling in the `AnalyticsSnapshot` model added after your first
migration, run `pnpm prisma:migrate` again to pick it up, then trigger the
nightly job manually to see data on `/admin/analytics` (Vercel Cron only
fires on an actual Vercel deployment):

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:4000/api/cron/analytics
```
