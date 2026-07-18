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

### CMS and admin share one database

Running a CMS against its own separate data store from the app's primary
database is a real, recurring source of friction: no foreign keys across the
two stores, two migration systems, two backup paths, and a real risk that
auth/session logic gets implemented twice and quietly drifts apart between
the two systems. This toolkit runs the CMS against the same Postgres
instance as everything else from the start.

### Auth/permission checking implemented once

A single session/permission-check module, imported by both the CMS layer
and the admin routes — not ported twice into two different trees.

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

## Open questions

### Auth provider pluggability — adapter pattern vs. adopting an existing library

Two paths, not yet decided:

- Build a thin custom `AuthProvider` interface and implement providers as
  needed — full control over the session/JWT pattern, more code to maintain.
- Adopt an already-pluggable auth library (e.g. Auth.js, Lucia) and wrap
  what's needed as a provider inside it — less code to maintain, less
  control over the exact session mechanics.

### License

Not yet chosen. Matters if this is ever shared beyond personal use.

### CMS choice

Payload CMS is the leading candidate given prior hands-on experience with
it, but not locked in — worth a deliberate check against alternatives before
committing, given this is meant to be reused across many future projects.

## Provenance

Patterns in this toolkit were generalized from lessons learned building a
client project — reusable infrastructure only (auth mechanics, admin
scaffolding shape, audit-log pattern, CMS/database integration pattern). No
client-specific business logic, data models, or branding carried over.
