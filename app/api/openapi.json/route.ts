import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { buildOpenApiSpec } from '@/lib/openapi/spec'

// GET /api/openapi.json — backs the /admin/api-docs viewer. Not a /api/v1/
// resource itself (API metadata, not business data) — gated on
// authentication only, same as the /admin hub's "any signed-in admin" level.
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { data: null, error: { code: 'unauthorized', message: 'Sign in required' } },
      { status: 401 },
    )
  }

  const spec = buildOpenApiSpec(new URL(request.url).origin)
  return NextResponse.json(spec)
}
