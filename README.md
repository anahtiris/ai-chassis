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

Working skeleton: Next.js + Payload (Postgres adapter, `payload` schema) +
Prisma (`app` schema, same instance) + Auth.js v5 with a Microsoft Entra ID
provider + a pluggable AI-provider abstraction (`lib/ai/provider.ts`) and
knowledge-provider interface (`lib/knowledge/provider.ts`). `pnpm install`
and a full `tsc --noEmit` both pass. Not yet built: Payload's admin
mount-point routes (normally tool-generated, not hand-written — see below),
the actual admin portal UI, and the RAG implementation behind the knowledge
interface.

### Getting started

```bash
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_*, PAYLOAD_SECRET
pnpm install
pnpm payload generate:importmap   # generates Payload's admin mount point
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```
