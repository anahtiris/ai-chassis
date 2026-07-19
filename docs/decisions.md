# Design Decisions & Open Questions

Living log of decisions made while shaping this toolkit, and what's still
open. Entries are appended, not rewritten, once settled.

## Settled

### Deployment model: fork-and-customize starter template

Not a multi-tenant SaaS product. Each project clones/forks this repo and
customizes it. No tenant isolation, no per-tenant billing, no shared
multi-customer deployment concerns baked in — that would be a materially
different, bigger undertaking than what this is for.

### Admin portal scope: domain-agnostic only

Covers content (via the CMS), AI prompt management, AI conversation review,
form results, audit log, analytics, and users & permissions. Deliberately
does **not** attempt to generalize arbitrary business-entity CRUD — a
project's specific domain objects get built on top, per project, not
templated here. Trying to also generalize arbitrary CRUD would mean
effectively building a mini admin-generator — a much bigger, vaguer
undertaking that dilutes focus from what's actually reusable.

### CMS and admin share one Postgres instance

Running a CMS against its own separate data store from the app's primary
database is a real, recurring source of friction: no foreign keys across the
two stores, two migration systems, two backup paths, and a real risk that
auth/session logic gets implemented twice and quietly drifts apart between
the two systems. This toolkit runs the CMS against the same Postgres
instance as everything else, sharing one connection string and one backup
path.

**Revised from the original plan:** initially this meant a custom `payload`
schema for Payload plus a separate `app` schema for Prisma. Corrected after
hitting it in practice — `@payloadcms/db-postgres`'s `schemaName` option is
marked experimental by Payload themselves, with open upstream bugs where
tables land in `public` regardless of what's configured. Not something to
build a reusable template around. Payload now uses its stable default
(`public`); Prisma's `app` schema remains the one deliberate separation,
which has no such caveat. Still one instance, still no cross-store friction
— just via Payload's default rather than a custom schema name.

### Keep a separate ORM (Prisma) for the app-layer/admin-scoped data, not Payload collections for everything

Considered collapsing everything into Payload collections, since the
admin-scoped surface (audit log, form results, users/permissions, AI
prompts, analytics) is deliberately lighter than the original project's
full business-entity layer. Decided against it: each project forked from
this toolkit will bolt on its own, often relationally-complex business
model on top (the exact reason the original project split a separate ORM
out from Payload in the first place — Payload's collection model isn't a
good fit for complex relational business logic). Keeping Prisma available
for that layer, on the shared instance described above, means each forked
project can model its own domain freely without fighting the CMS's data
layer.

### Auth/permission checking implemented once

A single session/permission-check module, imported by both the CMS layer
and the admin routes — not ported twice into two different trees. This
covers session *verification* only ("who is this, is the session valid").
*Authorization* — what a verified identity is allowed to do — can and
should differ per area: the CMS side might check a coarser flag, the admin
portal checks the finer permission enum (audit log access, user management,
etc.). One shared session, area-specific permission checks on top.

### AI knowledge layer is pluggable

Two knowledge-provider implementations behind one interface:

- **Direct content injection** (default) — pull relevant structured content
  straight into the system prompt. Simplest, cheapest, most deterministic.
  Right choice while content volume is small.
- **RAG** (opt-in) — embeddings + vector similarity search, worth turning on
  once content volume grows past what comfortably fits in a prompt. If the
  CMS ends up being Payload, lean on an existing vectorize plugin for the
  embedding/indexing pipeline rather than hand-rolling it — that part is
  already solved well elsewhere.

### Storage is pluggable, S3-compatible by default

No hardcoding to a single cloud storage provider.

### License: MIT

Matches Payload's own license (also MIT), so no friction between the
toolkit's license and its main dependency. Permissive enough for the
fork-and-customize-per-client model — commercial use, modification, and
redistribution are all unrestricted under MIT.

### CMS choice: Payload

Confirmed and checked, not just assumed: Payload's core is MIT licensed,
free to self-host, no usage-based pricing. There's a separate paid
Enterprise tier (SSO, support contracts, an AI/RAG framework) that isn't
needed here — the free, open-source core covers everything this toolkit
uses. One real restriction, trademark not code: Payload's name/logo can't
be used for commercial marketing without permission, which affects how
`ai-chassis` or client work built on it can reference Payload in branding,
not how the code can be used.

### AI provider abstraction: pluggable

The original project was locked to Azure OpenAI specifically. Decided:
`ai-chassis` abstracts over LLM providers rather than standardizing on one —
likely via the Vercel AI SDK, which is built for exactly this (one interface
over many providers). Consistent with auth/storage/knowledge-layer also
being pluggable rather than hardcoded.

### Auth: Auth.js (v5)

Chosen over building a custom `AuthProvider` interface. Lucia was ruled out
(deprecated by its maintainer March 2025, no active development since,
repositioned as a learning resource rather than an installable library).
Auth.js v5 is genuinely Edge-compatible (rewritten onto standard Web APIs),
ships a built-in Microsoft Entra ID provider plus ~80 others, and security
patches arrive via dependency upgrade rather than being this toolkit's
problem to find and fix. Still needs glue code mapping its session/user
shape onto this toolkit's role/permission model, but that's the bulk of the
remaining auth work now, not the whole OIDC/JWT flow.

Worth confirming directly against Next.js 16's own release notes at
implementation time, not just taken on faith here: `middleware.ts` was
reportedly renamed to `proxy.ts` and moved from the Edge runtime to the
Node.js runtime as of Next.js 16, which would further weaken the original
"must be Edge-safe" constraint this decision was partly weighed against.

### Default auth provider: Credentials (username/password), Entra ID optional

The original project used Entra ID (OIDC) exclusively — fine for a single
client with an existing Microsoft tenant, wrong as a starter-kit default.
Requiring an Entra app registration just to log into a *fresh fork* for the
first time is real setup friction this toolkit shouldn't impose. Credentials
is now the first provider in `auth.ts` and needs zero external setup: it
checks a bcrypt `password_hash` column on `User` (prisma/schema.prisma),
seeded via `pnpm seed:admin <email> <password>` (scripts/seed-admin.ts).
Entra ID remains wired up as a second, fully optional provider — leaving its
`AUTH_MICROSOFT_ENTRA_ID_*` vars unset simply leaves it unused, no error.
This is also the concrete first instance of "auth should support more than
one possibility," a goal raised early on when scoping this toolkit out from
the original single-provider project.

One thing this doesn't solve: `UserPermission` rows still need to exist
before a Credentials-authenticated user can do anything beyond log in — see
"Admin portal scope" above. `seed:admin` only creates the login, not
permissions; that's still a manual step (direct DB insert, or a future
admin-users UI once that's built) until the admin portal itself exists.

### Bootstrap: first user is owner, not auto-provisioned permissions

Surfaced directly while testing the Entra ID provider end to end: since it's
stateless (no Auth.js `adapter`), a successful Microsoft sign-in on a fresh
database had no connection to Prisma's `User`/`UserPermission` tables at
all — logged in, but invisible to the permission system. Fixed via a
`signIn` callback in `auth.ts`, shared by both providers:

- If the database has **no users at all yet**, the first successful sign-in
  from *either* provider creates the `User` row and sets `is_owner: true`.
  `seed:admin` (scripts/seed-admin.ts) applies the same rule for the
  Credentials path, so whichever bootstrap happens first — running the seed
  script, or just signing in with Entra ID against an empty database — wins,
  consistently.
- After that first user exists, unrecognized emails are rejected at sign-in
  rather than silently auto-provisioned. Otherwise anyone who can complete
  OAuth against the configured Entra tenant would get a real, if
  permissionless, account here just by showing up — not something a starter
  kit should default to. New users need a `User` row to already exist
  (direct DB insert for now; a future admin-users UI once the portal itself
  is built) before they can sign in at all.

`is_owner` is a full bypass in `lib/auth/permissions.ts`'s `hasPermission()`,
not a granted set of permissions — this toolkit deliberately has no fixed
permission list (see "Admin portal scope" and the `UserPermission` model's
comment), so "grant every permission" isn't expressible as rows the way it
would be in a project with a fixed enum. A coarse owner/not-owner bypass is
the generic equivalent. `lib/auth/permissions.ts` is the shared
permission-check module referenced above — built now rather than left
pending, since the owner-bypass logic needed somewhere to live.

### RAG implementation: payloadcms-vectorize + pgvector, not Payload's native offering

Payload's own first-party "RAG-ready"/"AI Auto Embedding" framework is
Enterprise-tier only, not part of the free MIT-licensed core this toolkit
uses. Instead: the open-source `payloadcms-vectorize` plugin, using its
Postgres adapter (pgvector as an extension on the shared instance already
decided on above), for the RAG implementation behind the pluggable
knowledge-layer interface. The plugin handles vectorization mechanics
(non-blocking, via Payload's job queue; incremental re-embedding that skips
already-current documents; cleanup on delete) and is provider-agnostic on
embeddings — it exposes hook functions you plug an embedding provider into,
rather than hardcoding one, consistent with the pluggable-AI-provider
decision above. Compatibility with whatever Payload version this toolkit
pins should be checked at implementation time — last verified against
Payload 3.69.0. What this toolkit still has to build itself: the
`getRelevantKnowledge()` interface the concierge actually calls, which
either does direct injection or calls into this plugin's query function
depending on project config.

**Now implemented**, and re-verified directly against the plugin's actual
README rather than relying on the "last verified against 3.69.0" note above
— `payloadcms-vectorize` and `@payloadcms-vectorize/pg` resolved at `^1.1.0`
(the adapter's own README still says "0.x, pre-1.0" as of this writing; npm
disagreed, so the installed version is the source of truth, not the doc).
Embeddings reuse the existing `AI_PROVIDER` abstraction
(`lib/ai/embeddings.ts`, OpenAI's `text-embedding-3-small`) rather than the
plugin's own Voyage AI example, so a project has one provider decision, not
two. `payload.config.ts` only registers the plugin — and only requires the
Postgres `vector` extension — when `RAG_ENABLED=true`; direct injection
stays genuinely dependency-free by default, per the original decision above.

Two things worth flagging, not resolved by writing the code:

- **Untested end to end.** Verified by real `pnpm install` + `tsc --noEmit`
  against the actual published package types (not guessed from docs), but
  never run against a live Postgres with the `vector` extension installed or
  a real `OPENAI_API_KEY` — no such environment was available while building
  this. Treat first real use as the actual test, not this implementation.
- **Realtime embedding depends on something calling `getPayload({ cron: true
  })`.** `lib/payload/client.ts` does this, and `RagProvider` uses that
  client — but nothing in this toolkit calls `getKnowledgeProvider()` yet
  (there's no concierge chat endpoint built, only the `ConciergeChat.tsx`
  *pattern* referenced from the original project's POC, per "Established POC
  Patterns"). Until that endpoint exists, saving content in `/admin/cms`
  with `RAG_ENABLED=true` may not actually trigger embedding — verify via
  the `payload-jobs` collection rather than assuming it works.

### UI components: Storybook, not a kitchen-sink page

A previous project's Storybook setup broke, traced (from memory, not
re-diagnosed here) to mixing `@storybook/nextjs` (the webpack-based
framework) with Vite-based pieces — either `@storybook/nextjs-vite`
alongside it, or a Vite-dependent addon like `@storybook/addon-vitest` on
top of the webpack framework. Two build pipelines fighting over the same
config is the likely failure mode, not Storybook itself.

Verified directly rather than assumed this time: `pnpm dlx storybook@latest
init` against this project (Next.js 16.2, React 19) auto-detected and
recommended `@storybook/nextjs-vite` — Storybook's own current guidance is
to prefer the Vite-based framework for Next.js generally, not just as a
workaround here. Every addon installed (`addon-vitest`, `addon-a11y`,
`addon-docs`, `addon-mcp`, `@chromatic-com/storybook`) is Vite-based too, so
there's exactly one bundler in play. Confirmed working end to end: `pnpm
build-storybook` produces a clean production build, `pnpm storybook` serves
a working dev server on port 6006 — both tested against this project's
actual files, not just in isolation.

The auto-init's own dependency-install step crashed partway through (a
`fetch failed` network error mid-run, unrelated to the framework choice
itself) and left `.storybook/main.ts` written but the packages never added
to `package.json`. Installed them manually afterward, pinned to the same
`10.5.2` the generator had already resolved (`@storybook/addon-mcp` is
independently versioned at `0.7.0` — not part of the same release train as
the rest, left unpinned to `^0.7.0` accordingly).

No component stories exist yet beyond Storybook's own generated welcome
page (`stories/Configure.mdx`) — every admin page so far is inline-styled
directly in the page file, no extracted reusable components. That's the
next piece: pick a component library/design system and start extracting
real, story-documented components out of the admin pages, rather than
writing stories against Storybook's generic placeholder examples.

### Component stories for the UI kit

Added `stories/ui/*.stories.tsx` — one file per `components/ui/*` primitive
(Button, Badge, Card, Input, Textarea, Label, Table, Checkbox, Tag, Popover,
Dropdown), each with a handful of variant/state stories rather than a single
default. CSF3 format (`Meta`/`StoryObj` from `@storybook/nextjs-vite`,
`tags: ['autodocs']` for the auto-generated docs page).

**Found and fixed a real gap while doing this, not just an addition:**
`.storybook/preview.tsx` never imported `app/globals.css`. Every story
before this was rendering completely unstyled — no Tailwind utilities, no
semantic tokens, nothing — since nothing in the Storybook config loaded the
CSS pipeline. Fixed with one import (`import '../app/globals.css'` in
`preview.tsx`); confirmed the fix actually took by grepping the built
`iframe.css` output for a known token value (`oklch(0.205...)`, this
project's `--primary`) and a compiled utility class (`.bg-primary`) —
both present after the fix, absent before. Verified via a real
`pnpm build-storybook` (Vite build succeeds, ~30kB of real Tailwind CSS in
the output, versus Storybook's bare default styles beforehand).

`Dropdown`'s discriminated-union props (`DropdownSingleProps |
DropdownMultipleProps`) don't have optional/default values, so a
`render`-only story (managing its own `useState` for a live demo) doesn't
satisfy `StoryObj`'s `Args` requirement on its own — TypeScript needs *some*
`args` matching one arm of the union even though `render` ignores them.
Fixed by giving each `Dropdown` story a minimal correctly-typed `args`
object alongside its `render` function, rather than loosening the story's
type. Every other component's props were permissive enough not to need
this.

`AdminShell` itself was deliberately left out of this pass — it needs a
signed-in session, permission flags, and Next's router context to render
meaningfully, which is a heavier mocking setup than the other components
warrant; can be added later with `parameters.nextjs` if it's worth the
investment.

### UI components: ported from the POC, de-branded

Investigated directly rather than assumed: the original project's
`payload-poc` already had a full Tailwind v4 + shadcn/ui setup (30
components under `components/ui/`, Radix primitives, an `AdminShell` layout,
a custom searchable `Dropdown`) — genuinely reusable infrastructure, not
business logic, so worth carrying over rather than re-deciding a component
library from scratch. One thing complicated a straight copy: the branding
wasn't confined to a swappable theme file. Every component checked
(`button.tsx`, `card.tsx`, `badge.tsx`, `popover.tsx`, `checkbox.tsx`,
`tag.tsx`) had brand-specific values baked directly into variant
definitions — `variant: 'primary'` resolved to a literal `.btn-amethyst`
class, colors were hardcoded as `var(--color-mystic-byte)` rather than
through shadcn's swappable semantic tokens (`--primary`, `--popover`,
etc.), and `globals.css` had replaced shadcn's standard token set entirely
with a hand-designed brand system (glass panels, gradients, halo
animations).

Decided: strip to shadcn's neutral defaults, not carry the Blackatz theme
over. Attempted to regenerate cleanly via `shadcn init`/`add` first rather
than hand-stripping 30 already-customized files — this failed for an
environmental reason, not a version-compatibility one: `ui.shadcn.com` is
unreachable from the sandbox this was built in (confirmed via direct
`curl`, connection-level failure — `HTTP 000` — same class of limitation as
the Prisma engine binary host hit earlier in this project). Tried multiple
CLI versions (`shadcn@latest`'s newer preset-based init, `shadcn@4.x`'s
remote style-registry fetch, `shadcn@2.3.0`'s classic local-only flow) —
all either require reaching that host or, in the oldest version's case,
predate Tailwind v4 detection entirely.

**Resolution:** hand-wrote the standard shadcn "new-york" style component
source directly (`components/ui/{button,card,badge,input,label,textarea,
table,checkbox,tag,popover}.tsx`, `lib/utils.ts`'s `cn()` helper,
`components.json`, and `app/globals.css`'s standard OKLCH semantic-token
theme block), using the well-established, stable shadcn template rather
than the POC's brand-customized versions. Also ported the custom
`Dropdown` (searchable single/multi-select combobox built on Radix
Popover — not part of shadcn's own registry, genuinely custom, structurally
clean once de-branded). Every component references semantic tokens
(`bg-primary`, `text-muted-foreground`, etc.) rather than literal colors,
so re-theming per fork means editing `globals.css`'s token values, never
touching component files.

**What this means for confidence:** unlike the rest of this project's
dependencies, this wasn't verified against a live upstream source (no
registry fetch succeeded) — it's based on stable, well-known shadcn
conventions rather than a fresh CLI-generated baseline. Verified instead via
a real `pnpm install` + `pnpm typecheck` + `pnpm build` (Turbopack) against
this project's actual files — compiled successfully, confirming the
Tailwind/PostCSS/component pipeline itself is wired correctly, even though
the component *source* wasn't registry-verified.

Wired into all six admin pages under `app/admin/(shell)/` (users,
audit-logs, form-results, ai/prompts, ai/conversations, analytics) —
`Table`/`Card`/`Badge`/`Input`/`Label`/`Textarea`/`Button` replaced the
inline-styled `<main style={{...}}>` scaffolding those pages started with.
Server-action forms (grant/revoke permission, save/create prompt) kept their
exact existing logic; only the markup and styling changed.

### AdminShell: sidebar + navbar, nothing more

The POC's `AdminShell` had a collapsible sidebar (icon-only mode,
`localStorage`-persisted), a separate mobile nav strip, and a hand-rolled
`/api/auth/logout` fetch — all coupled to Blackatz's own nav items. Rather
than port that complexity, this toolkit's version (`components/admin/
AdminShell.tsx`) was scoped down deliberately: a fixed-width sidebar and a
top navbar, nothing else. No collapse toggle, no mobile-specific nav. If a
fork needs those back later, they're additive, not a redesign.

Nav items are this toolkit's own six admin pages (Users & Permissions,
Audit Log, Form Results, AI Prompts, AI Conversations, Analytics) — not the
POC's business-entity pages. Each is permission-gated: `app/admin/(shell)/
layout.tsx` (a Next.js route group, not a pathname check like the POC used)
resolves `hasPermission()` for the signed-in user server-side and passes
down only the visible keys, so `AdminShell` itself never touches the
database or makes an authorization decision — it just renders what it's
told is visible. Sign-out uses Auth.js's `signOut()` passed in as a server
action prop (the same pattern already used in the hub page), not a custom
route.

**Why a route group instead of the POC's pathname check:** the POC's
`layout.tsx` was a client component that called `usePathname()` and
conditionally rendered `<AdminShell>` around `children` based on a hardcoded
list of "bare" paths. That works, but it means every request pays for a
client-side layout decision and the bare/wrapped split lives as a string
list that has to be kept in sync by hand. Next.js route groups
(`app/admin/(shell)/`) express the same split structurally — pages under
`(shell)/` get the layout, `/admin` and `/admin/login` (outside it) don't —
so the routing tree itself is the source of truth instead of a maintained
exclusion list.

**i18n: kept the POC's mechanism, not its content.** The original plan for
this toolkit dropped i18n entirely, on the assumption that the POC's
Thai/English `t()` system was tied to a specific market. Revisited: the
*mechanism* — a namespace-scoped JSON catalog with a humanize-on-miss
fallback (`lib/i18n.ts`) — is genuinely domain-agnostic infrastructure, the
same category as the permission system or the audit log. What was
Blackatz-specific was the catalog *content* (business nav labels, Thai
strings), not the lookup pattern itself. So the pattern was kept, trimmed to
two namespaces this toolkit actually needs (`admin`, `common`), and
`messages/en/*.json` was repopulated with this toolkit's own nav labels and
hub-card copy — no business strings carried over. A future fork can add
more locales by adding catalog files; nothing about the lookup function
needs to change.

### /admin hub page: header + cards, stands alone

Rebuilt `app/admin/page.tsx` to match the POC's own hub landing shape — a
header (eyebrow + heading + signed-in-as + sign out) and a grid of cards,
one per admin destination the signed-in user has access to (Content/CMS,
Users & Permissions, Audit Log, Form Results, AI Prompts, AI Conversations,
Analytics). Each card's visibility is resolved the same way as the sidebar's
nav items — `hasPermission()` per destination, evaluated server-side before
render — so a user only ever sees cards (or sidebar links) for sections they
can actually open.

This page is intentionally outside the `(shell)` route group and so is
never wrapped in `AdminShell` — it's what the sidebar's logo links back to,
not a page inside the sidebar's own navigation. Same reasoning as the POC's
own layout comment ("hub landing... stand[s] alone").
- A real AI chat/concierge UI. The POC's `ConciergeChat.tsx` looked
  promising but turned out to be a fully scripted mock — a hardcoded
  `SCRIPT` object and fake referral-code generator, no call to any AI
  provider at all — and its content (Blackatz's specific sales script,
  Hovia referral flow) is business logic, not infrastructure. Building a
  *real* one — wired to `lib/ai/provider.ts` and `lib/knowledge/provider.ts`,
  generic content — is a separate, larger feature, not a port.

## Known issues

### Prisma's first-migration check isn't scoped to the `app` schema — setup order matters

Discovered during actual local setup, not caught by `tsc`/install validation.
Root cause, in two parts:

1. `@payloadcms/db-postgres`'s `schemaName` option (originally used to put
   Payload in its own `payload` schema) is experimental with open upstream
   bugs — tables can land in `public` regardless of what's configured. Fixed
   above: Payload now just uses its stable `public` default, no custom
   schema name.
2. Independent of that bug: Prisma's "is this database empty" safety check,
   which only ever runs on the very first `migrate dev` for a project,
   inspects the whole database rather than just the `app` schema declared in
   `datasource.schemas`. So even with Payload correctly on `public` by
   design (not by bug), if any Payload command runs first and pushes tables
   into `public`, Prisma's first migration still fails with P3005 ("database
   schema is not empty") — `app` itself is genuinely empty, but Prisma's
   check doesn't know to ignore `public`.

**Current mitigation:** `prisma:migrate` must run before any Payload command
touches the database, documented in the README's Getting Started steps.
Since the check never re-runs after a successful first migration, getting
the order right once is sufficient — this isn't a permanent workaround, just
a one-time ordering constraint.

**Possible permanent fix, not done yet:** scope Prisma's Postgres role to
`GRANT USAGE` on only the `app` schema, so the check structurally can't see
`public`'s tables regardless of order. Worth weighing before treating this
toolkit as finished, though restricting a role from the default `public`
schema is itself a slightly unusual setup — the ordering constraint above
may be the more pragmatic answer long-term rather than fighting Postgres's
own default schema conventions.

**Trap this leads people into:** if P3005 shows up, dropping and recreating
*only* `app` looks like the obvious fix and isn't — it also deletes Prisma's
own `_prisma_migrations` tracking table (which lives inside `app`), which
resets Prisma back to believing this is the first migration ever. The
whole-database check then re-runs and fails again immediately, because
`public` still has Payload's tables (Payload pushes them there automatically
on `pnpm dev`, not just when `/admin/cms` is actually visited — so `public`
is dirty far sooner than it looks). Recreating `app` alone can loop on this
indefinitely. The actual fix is to drop and recreate *both* schemas, then
re-run `prisma:migrate` before starting `pnpm dev` or touching any Payload
command again.

### Analytics: nightly snapshot job, dashboard never reads live tables

Carried over from the original project's rule (CLAUDE.md §8 "Analytics Batch
Job"): a scheduled job writes aggregate counts to a snapshot table, and the
admin dashboard reads *only* that table, never live rows directly. Two
reasons this matters, not just precedent: computing aggregates on every
dashboard load gets slow as tables grow, and it keeps the dashboard's
queries decoupled from whatever indexes/schema changes happen on the live
tables over time.

One deliberate generalization: the original project hardcoded `Asia/Bangkok`
as the job's timezone, since that business is Thailand-based. This toolkit
has no such business to anchor a timezone to, so `ANALYTICS_TIMEZONE` is an
env var (default `UTC`) controlling what counts as "yesterday" when the job
computes metrics. Vercel Cron's own `schedule` field in `vercel.json` is
always UTC regardless of this — the two have to be set consistently per
project (a schedule of `0 17 * * *` fires at local midnight for UTC+7, for
instance).

`AnalyticsSnapshot` uses a generic `(snapshot_date, metric_key, value)`
shape rather than fixed columns per metric — same reasoning as
`UserPermission`'s free-text `permission` field. This toolkit only has
domain-agnostic tables to count (form submissions, AI conversations, audit
log entries); a project's own business metrics get added as more
`metric_key` values in `app/api/cron/analytics/route.ts`, not more models or
migrations.

### Single sign-on: bridge Payload's admin auth to Auth.js

Without this, `/admin/cms` (Payload) and `/admin/*` (this toolkit's own
portal) are two completely separate credential sets — Payload ships its own
`users` collection with local email/password auth by default, unrelated to
whatever Auth.js provider a project has configured. Signing into `/admin
/login` via Entra ID (or Credentials) has zero effect on Payload's session;
an empty Payload `users` table shows its "create first user" onboarding
regardless.

Ported from the original project's `payload-poc`
(`payload/auth/entraStrategy.ts`), which solved this by giving Payload a
custom `AuthStrategy` that reads the *same* session cookie the custom admin
portal uses, disables Payload's local strategy entirely (removing both
password login and the create-first-user flow), and provisions a matching
Payload `users` row on first sight, keyed by email.

**What changed in the port, not just a copy:** the POC decoded its own
hand-rolled HS256 JWT (`verifySession()`, a custom `jose`-based helper) by
parsing the cookie header manually. This toolkit uses Auth.js instead, so
the direct equivalent is `next-auth/jwt`'s `getToken()` — deliberately
*not* hand-rolled the way the POC's cookie parsing was, because Auth.js
v5's JWT encoding derives a different encryption key per cookie name (the
`salt` parameter) and applies a `secure`-prefix convention Auth.js manages
internally; reproducing that by hand risks silently failing to decode
otherwise-valid sessions. `getToken()` is Auth.js's own public API for
exactly this situation — reading its session cookie outside of a Next.js
request lifecycle, which is what a Payload `AuthStrategy` is (it receives
raw `headers`, not a full request/response cycle). Confirmed its shape
matches what Payload hands a strategy directly: `getToken({ req: { headers
} , ... })` accepts the same `Headers` instance Payload's
`AuthStrategyFunctionArgs.headers` already is — no adapter needed.

`lib/payload/authStrategy.ts` (the bridge) and `lib/payload/access.ts` (a
generic `authenticated` predicate, also ported) are new. `payload.config.ts`
now defines an explicit `users` collection — previously there wasn't one,
so Payload auto-generated its own default (with password fields) the
moment `admin.user` needed *something*, which is what produced the
create-first-user prompt in the first place. The new one:
`disableLocalStrategy: true`, `strategies: [authjsStrategy]`, `admin.hidden:
true` (operators aren't managed here — that's `/admin/users`, backed by
Prisma's `app.User`; this collection exists only because Payload requires
*some* auth collection to attach admin sessions to).

**Follow-up required, not automatic:** because the `users` collection's
shape changed (no more password/reset-token/lockout columns), any project
that already ran a first Payload migration needs a new one to alter that
table: `pnpm payload:migrate:create` then `pnpm payload:migrate`. If a
Payload local user was already created via the create-first-user flow
before this was wired in, it's not lost — `authjsStrategy` looks up by
email before creating, so the existing row gets reused once its email
matches the Auth.js session, and the now-unused password columns simply
disappear on the next migration.

### Payload CMS logout: back to the hub, not Payload's own logout

Once `/admin/cms` authenticates via `authjsStrategy` (see above), Payload's
default logout button doesn't do anything meaningful on its own: it clears
Payload's internal cookie, but the underlying Auth.js session cookie is
untouched, so the next visit to `/admin/cms` just signs back in immediately
via the same session. `payload.config.ts`'s `admin.components.logout.Button`
now points at `components/payload/BackToHubButton.tsx` instead — a plain
link back to `/admin`, where the toolkit's real sign-out (Auth.js's
`signOut()`, already wired into `AdminShell` and the hub page) lives.

### OpenAPI viewer (`/admin/api-docs`)

Ported the mechanism from the POC's `/admin/api-docs`
(`payload/lib/openapi/spec.ts`, `app/api/openapi.json/route.ts`, `app/api/
vendor/swagger-ui/[...file]/route.ts`), not its content — the POC's
`spec.ts` hand-documents Blackatz's entire business API (Leads, Referrals,
Partners, a fixed `Permission` enum, etc.), none of which exists in this
toolkit. `lib/openapi/spec.ts` here is a genuine starter: an empty `paths`/
`components.schemas` object with a comment explaining a fork adds entries as
it builds its own `/api/v1/**` routes, so the document stays a hand-authored
reflection of what's real rather than drifting from the code (the POC's own
stated design goal, kept here).

The `swagger-ui-dist` vendor-asset route is unchanged in shape: assets are
served straight from `node_modules` (not vendored into the repo) via a
filename allowlist, both it and `/api/openapi.json` gated on
`auth()`-verified sign-in. `next.config.ts` needs `serverExternalPackages:
['swagger-ui-dist']` — bundling that package rewrites the `__dirname` its
`absolute-path.js` relies on to locate the static bundle at request time.

### Hub simplification: 4 cards, not 7

Reverted the `/admin` hub page back to the POC's original shape — four
top-level destinations (Administration, CMS, Storybook, API Docs), all
visible to any signed-in admin with no per-card permission gate — after an
earlier iteration in this project expanded it to a permission-gated grid of
every individual admin section (Users, Audit Log, AI Prompts, Analytics,
etc. as separate cards). That version worked but the user found it
cluttered.

"Administration" now needs its own entry point, since there wasn't a single
landing page distinct from the six specific admin pages before — added
`app/admin/(shell)/dashboard/page.tsx`, minimal by design (the sidebar is
the real navigation from there), and a `dashboard` nav item in `AdminShell`
that's always visible regardless of permissions (unlike every other item,
filtered by `visibleKeys`). "Storybook" doesn't have an in-app route to
link to — it's a separate process (`pnpm storybook`, port 6006 locally) —
so that card is an external link, configurable via
`NEXT_PUBLIC_STORYBOOK_URL` for pointing at a deployed Storybook (e.g.
Chromatic) in production.

### Collections: generic infrastructure only, no page-builder blocks

Investigated the POC's `Pages`/`Posts` collections before porting anything —
they bundle two genuinely different things together. Generic CMS
infrastructure: SEO fields (`@payloadcms/plugin-seo`'s field components),
versioned drafts, `slugField()`, revalidation/populate hooks. Business
content: a full page-builder block library (`LandingHero`, `IndustriesGrid`,
`HowItWorks`, `TrustSection`, `IndustryPosts`, `CallToAction`,
`ArchiveBlock`) — Blackatz's actual wellness-referral marketing sections,
plus a fixed `/industries/<category>/<slug>` URL structure baked into
`generatePreviewPath` and the revalidation hooks.

Asked the user directly rather than guessing: **generic infrastructure
only**. So this port added `Categories`, `Media`, `Posts`, and upgraded the
existing minimal `Pages` (title/slug/content, unchanged field names — the
RAG knowledge-pool feed in `payload.config.ts` depends on them) with SEO
tabs, versioned drafts, and an `aiConcierge` question-override field — but
content itself is a single `richText` field, not a `blocks` field. No
`LandingHero`/`IndustriesGrid`/etc. exist here; a fork builds whatever page
sections its own product needs.

**Also generalized, not just stripped:** the POC's revalidation hooks called
`revalidatePath()` against its own fixed routes. This toolkit has no public
content routes of its own — that's for a fork to build — so path-based
revalidation isn't generic. `lib/payload/hooks/revalidateCollection.ts` is a
single `createRevalidateHooks(tag)` factory using `revalidateTag()` instead
(same pattern the AiConcierge global's own revalidation hook already used),
parameterized per collection rather than copy-pasted per collection like the
POC's `revalidatePost.ts`/`revalidatePage.ts`.

**Deliberately not ported: live preview.** The POC's `livePreview`/`preview`
config, `generatePreviewPath()`, and its `/next/preview` Draft Mode route
all assume a public content route exists to preview against — this toolkit
doesn't have one yet (confirmed: no `app/**/page.tsx` outside `/admin/*`
except the root `app/page.tsx`). Wiring live preview now would point at
URLs that 404. Versioned drafts work fine without it; live preview is a
natural follow-up once a project builds its own public `[slug]` route.

`Posts.authors` relates to the `users` collection — the same one
`authjsStrategy` provisions via SSO (see above). Reusing it as blog
authorship is a deliberate, reasonable overlap (CMS operators and post
authors are the same people here), not a layering mistake.

### AiConcierge global: mechanism ported, content de-branded

Same "mechanism vs. content" split already applied to i18n. The POC's
`AiConcierge` global (site-wide default suggested-question chips, checkbox
`enabled` toggle) and each page's `aiConcierge` field group (independent
per-document override, seeded from the global's current defaults on
creation via a `DefaultValue` function, `resolveConciergeQuestions()`/
`isConciergeEnabled()` as the read-side resolution logic) are genuinely
generic — this is exactly the kind of "AI concierge grounded in CMS
content" infrastructure this toolkit exists to provide. Only the actual
default question strings were business-specific ("What wellness programs
are available?", "How does a referral work?") — replaced with generic
placeholders ("What can you help me with?", "How do I get started?").
Lives under `lib/payload/concierge/` (`global.ts`, `defaultPageQuestions.ts`,
`resolveQuestions.ts`, `hooks.ts`).

### Validating Payload config changes without a live database

This sandbox has no Postgres, so `payload migrate:create` can't run here —
same limitation as Prisma's own migrations throughout this project. But
`payload generate:types` doesn't need a database at all (it only reads the
config), and running it is a real, useful validation: it exercises
`buildConfig`'s own schema construction across every collection/global/field
just built, not just TypeScript syntax. Payload's CLI needed
`@esbuild/linux-arm64` installed temporarily to run in this Linux sandbox
(the project's own `node_modules` only had the macOS binary) — added,
verified, then removed again before copying the lockfile back, so it
doesn't end up as a stray dependency in the real project (the lockfile's
existing `esbuild/linux-arm64` *entries* are normal — pnpm records every
optional platform variant for completeness regardless of host OS — just
confirmed those were already present before this session's changes, not
newly introduced). The regenerated `payload-types.ts` was copied back too,
so a fresh clone won't show stale-type errors before the first `pnpm dev`
regenerates it locally. The actual migration (`payload:migrate:create` then
`payload:migrate`) still has to run against a real database — see README.

### Post-port audit against payload-poc: two real gaps found and fixed

After the collections/AiConcierge port above, did a direct audit — listed
everything under the original project's `payload-poc/payload/` and checked
each piece off against what actually exists here — rather than assuming the
port was complete. Found two genuine gaps, not just cosmetic differences:

**`seoPlugin` was never registered.** `lib/payload/collections/{pages,posts}.ts`
use `@payloadcms/plugin-seo/fields`'s standalone field components
(`MetaTitleField({ hasGenerateFn: true })`, `PreviewField({ hasGenerateFn:
true })`, etc.) for the SEO tab — but those "Generate" buttons call whatever
`seoPlugin({ generateTitle, generateURL })` registers as their actual
generation logic. The plugin itself was never added to `payload.config.ts`'s
`plugins` array, so the buttons rendered but did nothing. Fixed: registered
`seoPlugin({ generateTitle, generateURL })`, with generic, non-Blackatz
functions — `generateTitle` produces `"{title} | ai-chassis"` (the original
hardcoded `Payload Website Template`'s branding, genericized), `generateURL`
builds off `NEXT_PUBLIC_SERVER_URL` and `doc.slug` rather than the original's
fixed `/industries/<slug>` shape.

**No `beforeLogin` redirect.** The POC's Payload admin config points
`admin.components.beforeLogin` at an `AzureLogin` component that immediately
`redirect()`s to `/admin/login` — because Payload's own local-strategy login
form is meaningless once `users` has `disableLocalStrategy: true` (see SSO
bridge above). This toolkit's `users` collection has the same
`disableLocalStrategy: true` but never added the equivalent redirect, so
hitting `/admin/cms` without a session would've rendered Payload's broken
local-login form instead of bouncing to the real one. Normally unreachable —
`proxy.ts` already gates all of `/admin/*` behind a valid session before
Payload's own admin ever renders — but a defensive fix worth having (a stale
cookie mid-navigation, for instance). Fixed: `components/payload/
RedirectToLogin.tsx` (a plain `redirect('/admin/login')`, generalized off the
Azure-specific naming since Credentials is this toolkit's default provider),
wired into `admin.components.beforeLogin`.

**Confirmed already correct, not a gap:** the Payload CMS logout button
(`BackToHubButton.tsx`, see above) independently converged on the same
`nav__log-out` className and `/admin` target as the POC's own `BackToHub`
component — built separately, arrived at the same design.

**What's deliberately excluded, not missing:** the page-builder block
library (`LandingHero`, `IndustriesGrid`, `TrustSection`, `HowItWorks`,
`IndustryPosts`, `CallToAction`, `ArchiveBlock`), the public-site `Header`/
`Footer` navigation globals, hero/seed content, the `Lead`/`Referral`
business services, and any business-specific wiring of `redirects`/
`nested-docs` plugins — all business content per the "generic infrastructure
only" scope decision above, not overlooked.

**Update — asked the user directly, all four ported:** `payload-poc/payload/
plugins/index.ts` also registers four more official Payload plugins beyond
`seoPlugin` — `redirectsPlugin`, `nestedDocsPlugin`, `formBuilderPlugin`,
`searchPlugin`. Flagged the `formBuilderPlugin`/`FormSubmission` collision
above before porting anything; the user chose to port all four and
reconcile the overlap rather than skip it. See "Four more Payload plugins:
redirects, nested-docs, form-builder, search" below for what was actually
built.

**Validating without a live database, revisited:** confirmed directly (not
assumed) that `payload generate:types` doesn't touch the database at all —
`buildConfig()` and `configToJSONSchema()` are pure config/schema
operations; the CLI's `generateTypes.js` only opens a DB connection if
something downstream needs one, which type generation doesn't. Set up a
throwaway embedded Postgres in-sandbox anyway (npm's `embedded-postgres` +
`@embedded-postgres/linux-arm64`, matching the pattern already used for the
sibling `payload-poc` project) before discovering this, confirmed the
command's behavior is identical with or without a database present. Left as
a documented option for future sandbox work that *does* need a live
connection (e.g. testing an actual `payload migrate:create`), but not
required for this validation.

### Four more Payload plugins: redirects, nested-docs, form-builder, search

Ported all four from `payload-poc/payload/plugins/index.ts`, after asking
the user directly rather than guessing (see the audit entry above). Three
are close to drop-in generic infrastructure; one — `formBuilderPlugin` —
needed a real decision, not just a copy.

**`redirectsPlugin`** — `collections: ['pages', 'posts']` (this toolkit's
own two content collections; unchanged from the POC, which used the same
two). Revalidation: reused the existing `createRevalidateHooks('redirects')`
factory (`lib/payload/hooks/revalidateCollection.ts`) instead of porting the
POC's near-identical one-off `revalidateRedirects.ts` (same
`revalidateTag('redirects', 'max')` call, just not parameterized) — one
generic mechanism, not two copies of the same logic. Left out the POC's
field-level `admin.description` override on the `from` field ("You will
need to rebuild the website when changing this field") — a fine tooltip,
but assumes a fork's redirect-serving layer works that way, which isn't
this toolkit's decision to make.

**`nestedDocsPlugin`** — `collections: ['categories']`, `generateURL`
joining ancestor slugs with `/`. Unchanged from the POC; adds `parent`/
`breadcrumbs` fields to `Categories` for hierarchical taxonomy, no
business-specific shape involved.

**`searchPlugin`** — `collections: ['posts']`, `beforeSync`/field-override
mechanism ported unchanged (`lib/payload/search/{beforeSync,fieldOverrides}
.ts`) — it only reads generic `slug`/`title`/`meta`/`categories` shapes,
which this toolkit's own `Posts` collection already has field-for-field
(confirmed by reading `lib/payload/collections/posts.ts` before porting,
not assumed).

**`formBuilderPlugin`, and the two-submission-systems problem:** the
plugin's own config (`fields: { payment: false }`, a richer lexical editor
on the confirmation-message field) is generic and ported as-is. The real
issue: `formBuilderPlugin` creates its own `form-submissions` Payload
collection — a second place submissions land, separate from this toolkit's
existing Prisma `FormSubmission` model (`app.form_submissions`), which
already backs `/admin/form-results`. The POC never had this problem because
it only had one form-submission system, wired through a hand-written
`afterFormSubmissionCreate` hook that matched a hardcoded `'Contact Form'`
title and POSTed to Blackatz's own `/api/v1/contact-inquiries` endpoint —
business pipeline logic, not portable.

Built `lib/payload/hooks/bridgeFormSubmission.ts` instead:
a `formSubmissionOverrides.hooks.afterChange` hook that mirrors every
form-builder submission — from any form, no title matching or business
routing — into the same Prisma `FormSubmission` row shape (`form_key` = the
submitted form's title, `name`/`email` extracted only if a form happens to
have fields with those exact names, full `submissionData` kept as `payload`
JSON, `source: 'PayloadFormBuilder'`). Result: `/admin/form-results` stays
the single place to see submissions, regardless of whether they came from
this toolkit's own forms or a fork's future non-Payload form. Payload's own
`form-submissions` collection still exists underneath (form-builder
requires it), but nothing needs to read it directly once the bridge is in
place.

**One implementation detail worth flagging, found via validation, not
guessed:** `bridgeFormSubmission.ts` originally imported `{ prisma }` from
`lib/db/client.ts` at the top of the file, statically. That broke
`payload generate:types` in this sandbox — not because of a config bug, but
because a static import is evaluated the moment `payload.config.ts` loads
the plugin, and this sandbox's `@prisma/client` was never actually generated
(same pre-existing `binaries.prisma.sh`-blocked limitation noted everywhere
else in this project). Fixed with a dynamic `await import('@/lib/db/client')`
inside the hook body instead — loaded only when a submission actually
happens, not at config-load time. This is a genuine improvement independent
of the sandbox limitation that surfaced it: it decouples Payload's config
construction (which should stay pure and fast) from whether Prisma's client
is even available yet, the same reasoning `docs/decisions.md`'s "Validating
Payload config changes without a live database" entry already relies on for
`generate:types` not needing a database.

Validated the same way as the `seoPlugin`/`beforeLogin` fix: a fresh
`payload generate:types` run succeeded (types file grew from ~17KB to
~28KB, reflecting the four plugins' own collections — `redirects`, `forms`,
`form-submissions`, `search` — plus `Categories`' new nested-docs fields),
`pnpm typecheck` and `pnpm build` both show only the known pre-existing
Prisma-client baseline error, nothing new. `@payloadcms/plugin-{redirects,
nested-docs,form-builder,search}` all resolved at `3.86.0` via a real
sandbox install (matching the existing `payload`/`plugin-seo` pin), not
hand-written.

### Separate Tailwind themes per section: admin+Payload share one, content gets its own later

Prompted by wiring a generated brand theme (colors, fonts, type scale,
shadows, radius) into the admin portal. Investigated first rather than
assumed: `app/(payload)/layout.tsx` renders Payload's own `RootLayout`
(`@payloadcms/next/layouts`), which renders its own `<html><body>` —
confirmed by reading `node_modules/@payloadcms/next/dist/layouts/Root/index.js`
directly. That's nested inside this toolkit's own root `app/layout.tsx`,
which also renders `<html><body>`. Browsers tolerate the resulting
duplicate start tags at the markup level (the HTML5 parsing algorithm
merges attributes onto the existing element rather than erroring), but this
also means whatever global CSS the root layout imports was already
cascading into `/admin/cms` by accident, not by design — worth knowing
before assuming Payload's admin panel is fully CSS-isolated. Separately:
this nesting does cause real React hydration warnings/errors in dev
(`<html> cannot be a child of <body>`), pre-existing and unrelated to this
CSS change — flagged as a follow-up, not fixed here.

Decided: stop relying on that accidental cascade. `app/layout.tsx` (the one
true root, wrapping every section) imports no CSS at all now — it's a bare
shell. Each section owns its Tailwind entry file, imported from that
section's own layout, using the fact that Next's App Router allows global
CSS imports from any `layout.*` file, not just root (confirmed against
Next's own docs, not assumed):

- `app/admin/layout.tsx` (new — wraps the hub, `/admin/login`, api-docs, and
  everything in `app/admin/(shell)/`) and `app/(payload)/layout.tsx` both
  import `app/globals.css`. Same file, not a duplicate — Next/webpack
  dedupes by resolved path — so the custom admin portal and anything
  Tailwind-based rendered inside `/admin/cms` (`BackToHubButton`, future
  custom fields) share one set of tokens.
- A future public content section gets its own separate CSS file (e.g.
  `app/content.css`) and its own route-group layout importing it —
  completely independent `@theme`, no shared tokens with admin/Payload
  unless deliberately factored out later. Not built yet; this just leaves
  the seam in place.

`app/globals.css` keeps its filename (shadcn's `components.json` and
`.storybook/preview.tsx` both already point at it) but is now scoped in
purpose to "admin + Payload," not "the whole app."

**Token mapping, asked directly rather than guessed:** the generated
system's full color scales (`primary`/`secondary`/`accent`/`neutral`,
50–950) are exposed as-is (`--color-primary-500`, etc.), and shadcn's
existing semantic tokens (`--primary`, `--secondary`, `--accent`,
`--destructive`, consumed by every `components/ui/*` file) are remapped
onto them — `--primary` → `primary-500` (the brand red), `--destructive` →
the generated system's separate `error` color, not `primary` again, so a
"Save" button and a "Delete" button stay visually distinguishable rather
than both reading as the same red. Verified in Storybook after wiring:
default (primary) and destructive buttons render as genuinely different
reds, not the same one. Font sizes map onto Tailwind v4's paired
`--text-*`/`--text-*--line-height`/`--text-*--letter-spacing` variables;
shadow/radius map onto `--shadow-*`/`--radius-*`. Tailwind's own default
numeric spacing scale (`p-4`, `gap-6`, etc.) was deliberately left
untouched — the generated system's spacing keys reuse the same low numbers
Tailwind's built-in scale already uses, and overriding them would shift
spacing on every existing admin page as a side effect of a color/font
change, not a decision worth making implicitly.

### Payload's own admin theme is a separate system from this toolkit's Tailwind tokens

After the brand theme above shipped, `/admin/cms` still rendered on a dark
background — investigated rather than assumed a leftover CSS bug.
`node_modules/@payloadcms/ui/dist/scss/colors.scss` defines its own
`--color-base-*`/`--color-success-*`/`--theme-elevation-*` variables in
`@layer payload-default`, switched via `html[data-theme='dark']`, entirely
independent of `app/globals.css`'s shadcn tokens — Payload's own components
(list views, forms, sidebar) never read `--background`/`--primary` etc. at
all. `payload.config.ts`'s `admin` block had no `theme` set, so it defaulted
to Payload's own `'all'` (follow OS preference), which is why it looked dark
regardless of our re-theming. Fixed by pinning `admin.theme: 'light'`. This
only fixes light-vs-dark consistency — Payload's native chrome still uses
its own color palette, not the brand's; actually re-skinning it would mean
overriding Payload's own `--color-*`/`--theme-*` variables too, not done
here.

### Type scale re-anchored at an 18px base, same 1.25 ratio

A later regenerated brand theme asked for an 18px base font size. Rather
than change only `--text-base` and leave the rest of the scale
inconsistent, every step (`--text-xs` through `--text-6xl`) was recomputed
at the same ~1.25 ratio the original 16px-anchored scale used, so the scale
stays a coherent progression rather than one step jumping out of line.

### `/admin/login` restyled to match the brand theme

Was still the original plain-HTML/inline-style scaffold after the brand
theme shipped elsewhere in the admin portal — the one page visitors see
before anything else, and the one place the mismatch was most visible.
Rebuilt with the same `Card`/`Input`/`Label`/`Button` components already
used on `/admin/users` and `/admin/ai/prompts`, no new patterns introduced.

### Create-user UI + `seed:admin` bcryptjs fix

Closes a real gap: outside of the very first (owner) sign-in, there was no
way to add a `User` row at all — not through Credentials, and not through
Entra ID either (both providers require a matching `User` row to already
exist post-bootstrap; see "Bootstrap: first user is owner" above, which
this corrects — Entra ID does *not* get an exemption). Two fixes:

- `scripts/seed-admin.ts` was broken under `tsx`:
  `import { hash } from 'bcryptjs'` failed at runtime
  (`does not provide an export named 'hash'`). Root cause: bcryptjs's CJS
  entry re-exports via `module.exports = require(...)`, which
  `cjs-module-lexer` (used by `tsx`/Node's native ESM loader) can't
  statically see through to detect named exports — unlike webpack, which
  bundles and inspects the same import differently in `auth.ts` and
  page-level server actions, where the named import already worked fine.
  Fixed with a default import (`import bcrypt from 'bcryptjs'` +
  `bcrypt.hash(...)`) in the `tsx`-run script only.
- `app/admin/(shell)/users/page.tsx` gained an "Add user" form/server
  action (owner-only, matching the page's existing gate) that creates a
  `User` row directly via Prisma, with an `AuditLog` entry. Password is
  required (not optional) — an account with no local password can only
  ever sign in via Entra ID, which needs its own env configured; making it
  optional here just produced accounts that couldn't sign in by either
  path if Entra ID wasn't set up, a worse default than requiring one.

This makes the "direct DB insert (for now)" language in "Default auth
provider" and "Bootstrap: first user is owner" above stale — there's now a
real UI path for both.

### Change-password settings page: scoped to accounts with a local password

Added a "Settings" card to the `/admin` hub (now 5 cards, not the 4 from
"Hub simplification" above — personal-account settings, not an
admin-permission-gated section, so it belongs at the hub level like the
other cards, not inside `AdminShell`'s per-permission sidebar) linking to
`app/admin/settings/page.tsx`.

Explicit decision on scope, asked directly rather than assumed: the form
only renders for users with a non-null `password_hash` (i.e. can already
sign in via Credentials). Entra ID-only accounts see an explanatory message
instead of a form. Rejected alternative: letting an Entra ID-only account
*set* a password here for the first time, becoming a dual-login account —
bigger scope (an identity-policy question, not just a UI one — should an
SSO-managed account be able to grow a local credential on its own?) and not
needed to close the actual gap (accounts that already have a password
having no way to change it). Can be revisited later if a project wants
that path.

## Open questions

### Deferred, lower priority

Package manager (pnpm was the original project's convention), testing
framework (Vitest, same), and version-pinning philosophy (exact pins vs.
ranges — exact pins made sense for a single client deliverable, less
obviously so for something meant to be reused across many future,
time-separated projects). None of these block starting real code.

## Provenance

Patterns in this toolkit were generalized from lessons learned building a
client project — reusable infrastructure only (auth mechanics, admin
scaffolding shape, audit-log pattern, CMS/database integration pattern). No
client-specific business logic, data models, or branding carried over.
