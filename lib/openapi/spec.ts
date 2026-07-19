/**
 * OpenAPI 3.1 document for this project's versioned business API, conventionally
 * under `app/api/v1/**` (see docs/decisions.md). Served at `/api/openapi.json`;
 * rendered at `/admin/api-docs`.
 *
 * This toolkit ships with no business API of its own — `/api/v1/**` is where a
 * fork's own domain routes go, per project. Add a `paths` entry (and any
 * `components.schemas` it references) here as each route gets built, so this
 * stays a real, hand-authored reflection of what actually exists rather than
 * generated/inferred documentation that can drift from the code.
 *
 * `/api/auth/*` (Auth.js) and `/api/cron/*` are intentionally excluded —
 * unversioned session/cron flows, not resource APIs. Payload's own content
 * REST API (`/api/[...slug]`) is also out of scope for this document.
 */
export function buildOpenApiSpec(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ai-chassis API',
      version: '0.1.0',
      description:
        'Starter OpenAPI document — add paths here as this project grows its own /api/v1/** routes.',
    },
    servers: [{ url: origin }],
    paths: {},
    components: { schemas: {} },
  }
}
