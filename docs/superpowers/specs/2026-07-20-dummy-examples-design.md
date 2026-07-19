# Dummy scaffolding examples — design & build plan

**Date:** 2026-07-20
**Status:** approved, ready to implement (combined spec+plan per user request — no separate implementation-plan doc)

## Goal

This repo is a fork-and-customize starter template, not a shipping product. A fork's
engineer needs concrete, working reference code for the four patterns the template
doesn't build out itself: a public content page, an API route, a backend service
layer, and an admin config page — plus the two workflows that cut across all of
them (writing audit logs on mutations, adding a new db table). Today none of that
exists as example code; this adds it, purely additively, without wiring anything
into live navigation or changing any existing behavior.

## Non-goals

- No real public content routing (that's still explicitly not built — see
  `CLAUDE.md`'s "No public content routes exist yet").
- No nav/hub entry for the dummy admin page — it must not appear as a real feature.
- No changes to any existing file's behavior; this is additive only.

## Decisions (from brainstorming)

1. **Placement:** dedicated top-level `examples/` folder for anything that can be
   kept out of Next's routing tree. The dummy API route and the dummy admin page
   still have to live under `app/` (Next.js requires that for routing), but stay
   unlinked from any nav/hub.
2. **DB table:** add a new `ExampleItem` model to `prisma/schema.prisma` (app
   schema) rather than reusing an existing model — gives the "add a table" guide a
   real worked example.
3. **Admin config page:** a real route at
   `app/admin/(shell)/examples/dummy-config/page.tsx`, but **inert by default** —
   it exports a small stub ("this example is disabled") and the full working
   implementation sits below it in a block comment. Visiting the URL today shows
   only the stub; nothing runs, nothing is queried, nothing is written. Uncommenting
   the block (and deleting the stub export) is the only way to activate it. Never
   added to the hub `CARDS` or nav either way.
4. **Test:** one vitest file for the backend service, following the existing
   `lib/ai/concierge.test.ts` style (test the service layer, not the Next.js route
   handler directly).
5. **Layout:** a `page.tsx` doesn't require a sibling `layout.tsx` in general
   (Next falls back to the nearest ancestor layout), but this repo's "one Tailwind
   theme per section" convention means a _new public section_ does need its own
   layout importing its own CSS. The frontend example includes a companion layout
   file for that reason.

## Components

### 1. `prisma/schema.prisma` — new model

```prisma
model ExampleItem {
  id          String    @id @default(uuid())
  name        String
  note        String?
  created_at  DateTime  @default(now())
  archived_at DateTime?

  @@map("example_items")
  @@schema("app")
}
```

### 2. `examples/backend/dummyItemService.ts` — backend service (no route)

`listExampleItems()` and `createExampleItem({ name, note })`, thin wrappers around
`prisma.exampleItem`. Demonstrates a service layer usable directly from a Server
Component/Action, independent of any HTTP route. Both the dummy API route and the
dummy admin page call into this rather than touching Prisma directly.

### 3. `examples/backend/dummyItemService.test.ts` — vitest

Mocks the Prisma client (matching `lib/ai/concierge.test.ts`'s approach), one test
for create, one for list.

### 4. `app/api/examples/dummy-items/route.ts` — dummy API

`GET` (list) and `POST` (create), same error-handling shape as
`app/api/concierge/route.ts`: validate the body, call the service inside a nested
try/catch, return controlled JSON errors (400 for bad input, 500 for unexpected
failures) rather than letting anything throw unhandled. Both methods require a
signed-in session (`auth()`) and `hasPermission(userId, "EXAMPLES_ACCESS")` —
consistent with the admin page below, so the two entry points demonstrate the same
full stack. `POST` writes an `AuditLog` row after a successful create
(`entity_type: "ExampleItem"`, `action: "create"`, `actor` = session user's email);
`GET` is not audited, matching the existing convention that reads aren't logged.
Not linked from any nav — reachable only by URL.

### 5. `app/admin/(shell)/examples/dummy-config/page.tsx` — dummy admin config page

Per decision 3 above: stub export by default, full implementation in a block
comment below it. The commented implementation mirrors
`app/admin/(shell)/ai/prompts/page.tsx` exactly — `auth()` + `hasPermission(...,
"EXAMPLES_ACCESS")` gate, a form backed by a Server Action that calls
`dummyItemService.createExampleItem`, an `AuditLog` write on save, and
`revalidatePath` afterward.

### 6. `examples/frontend/DummyPublicPage.tsx` + `DummyLayout.tsx` — dummy frontend (no route)

`DummyPublicPage.tsx` fetches from Payload's `Pages` collection via
`lib/payload/client.ts` and renders it — the query pattern a real public page would
use. `DummyLayout.tsx` is a companion example showing the per-section-CSS pattern
(importing its own `content.css`, per decision 5) — referenced in comments, not
paired with an actual `content.css` file since no real public route exists yet.
Both live outside `app/`, so neither is ever routable.

### 7. `examples/README.md` — instructions

Two walkthroughs:

- **Starting public web sites on Payload:** promote `DummyPublicPage.tsx` +
  `DummyLayout.tsx` into a real route (e.g. `app/(public)/[slug]/page.tsx` +
  `app/(public)/layout.tsx`), create the real `app/content.css` the layout
  imports, and wire up real Payload queries.
- **Adding a table to the db:** the exact steps used for `ExampleItem` — edit
  `prisma/schema.prisma`, `pnpm prisma:migrate`, `pnpm prisma:generate`, then use it
  from a service/route/page.

Also documents how to activate the dummy admin page (uncomment the block) and
what each example file is for.

### 8. `README.md` — pointer

Short "Examples" section added, pointing at `examples/README.md`, since this
changes repo structure and `CLAUDE.md`'s Documentation rule requires README to
stay current.

## Build order

1. `prisma/schema.prisma` — add `ExampleItem`, run `pnpm prisma:migrate` (create +
   apply migration) and `pnpm prisma:generate`.
2. `examples/backend/dummyItemService.ts`
3. `examples/backend/dummyItemService.test.ts`
4. `app/api/examples/dummy-items/route.ts`
5. `app/admin/(shell)/examples/dummy-config/page.tsx` (stub + commented block)
6. `examples/frontend/DummyPublicPage.tsx` and `DummyLayout.tsx`
7. `examples/README.md`
8. `README.md` — add the Examples section
9. Verify: `pnpm typecheck`, `pnpm lint`, `pnpm vitest run examples/backend/dummyItemService.test.ts` (and full `pnpm test` for a regression check)

## Testing

- New vitest file covers the backend service (create + list).
- `pnpm typecheck` and `pnpm lint` must pass with the new files included — the stub
  export in the admin page must be valid enough to typecheck on its own (the real
  implementation stays inert inside a comment, so it can't break the build).
- Manual check: `/admin/examples/dummy-config` renders only the stub when visited
  signed-in; `/api/examples/dummy-items` returns 401/403 without a session or
  `EXAMPLES_ACCESS`, and a 200 with a valid one.
