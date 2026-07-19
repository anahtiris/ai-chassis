import { readFile } from 'fs/promises'
import path from 'path'
import getAbsoluteFSPath from 'swagger-ui-dist/absolute-path'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

// Serves the pinned swagger-ui-dist static assets (JS bundle, preset, CSS)
// for the /admin/api-docs viewer straight out of node_modules — avoids
// committing a multi-MB vendored copy into the repo, and stays in sync with
// the pinned dependency version automatically. Whitelisted by exact filename
// only (no path traversal): this is not a general static file server.
const ALLOWED_FILES: Record<string, string> = {
  'swagger-ui-bundle.js': 'application/javascript; charset=utf-8',
  'swagger-ui-standalone-preset.js': 'application/javascript; charset=utf-8',
  'index.css': 'text/css; charset=utf-8',
  'swagger-ui.css': 'text/css; charset=utf-8',
}

export async function GET(_request: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { data: null, error: { code: 'unauthorized', message: 'Sign in required' } },
      { status: 401 },
    )
  }

  const { file } = await ctx.params
  const name = file.join('/')
  const contentType = ALLOWED_FILES[name]
  if (!contentType) {
    return NextResponse.json(
      { data: null, error: { code: 'not_found', message: 'Unknown asset' } },
      { status: 404 },
    )
  }

  const body = await readFile(path.join(getAbsoluteFSPath(), name))
  return new Response(new Uint8Array(body), { headers: { 'Content-Type': contentType } })
}
