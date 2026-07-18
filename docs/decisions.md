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

### CMS and admin share one Postgres instance, as two schemas

Running a CMS against its own separate data store from the app's primary
database is a real, recurring source of friction: no foreign keys across the
two stores, two migration systems, two backup paths, and a real risk that
auth/session logic gets implemented twice and quietly drifts apart between
the two systems. This toolkit runs the CMS against the same Postgres
instance as everything else — as two separate schemas within that one
instance (e.g. a `payload` schema for CMS-managed tables, a separate schema
for the app-layer ORM's tables), so each tool's migration tracking and table
names never collide, while still sharing one connection string, one backup
path, and the option of cross-schema foreign keys later if ever needed.

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
