'use client'

/**
 * /admin/api-docs — interactive OpenAPI reference for this project's
 * versioned business API (conventionally /api/v1/**). A top-level hub
 * destination — stands alone, outside AdminShell (see the /admin hub page).
 * Reachable by any authenticated admin, no permission gate. Renders
 * swagger-ui-dist against /api/openapi.json; the JS/CSS bundle is served
 * from node_modules by /api/vendor/swagger-ui rather than vendored into the
 * repo — see that route's docstring.
 */
import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface SwaggerUIBundleFn {
  (config: Record<string, unknown>): unknown
  presets: { apis: unknown }
  plugins: { DownloadUrl: unknown }
}

declare global {
  interface Window {
    SwaggerUIBundle?: SwaggerUIBundleFn
    SwaggerUIStandalonePreset?: unknown
  }
}

const ASSET_BASE = '/api/vendor/swagger-ui'

// Keyed by src so concurrent callers (e.g. React StrictMode's double-invoked
// effect in dev) await the same in-flight load instead of racing: checking
// for an existing <script> tag isn't enough, since a tag can already be in
// the DOM (appended by the other invocation) while its onload hasn't fired
// yet — resolving immediately in that case reports success before the
// script has actually executed.
const scriptPromises = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  const cached = scriptPromises.get(src)
  if (cached) return cached

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
  scriptPromises.set(src, promise)
  return promise
}

function loadStylesheet(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

export default function ApiDocsPage() {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    // swagger-ui-dist's index.css sets an unlayered `body { background:
    // #fafafa }` rule, which wins the cascade over our Tailwind `@layer
    // base` body background regardless of specificity. Reassert this app's
    // background for as long as this page is mounted.
    const override = document.createElement('style')
    override.textContent = `body { background: var(--background) !important; }`
    document.head.appendChild(override)
    return () => override.remove()
  }, [])

  React.useEffect(() => {
    let cancelled = false

    async function mount() {
      try {
        loadStylesheet(`${ASSET_BASE}/index.css`)
        loadStylesheet(`${ASSET_BASE}/swagger-ui.css`)
        await loadScript(`${ASSET_BASE}/swagger-ui-bundle.js`)
        await loadScript(`${ASSET_BASE}/swagger-ui-standalone-preset.js`)
        if (cancelled || !containerRef.current || !window.SwaggerUIBundle) return

        const { SwaggerUIBundle } = window
        SwaggerUIBundle({
          url: '/api/openapi.json',
          domNode: containerRef.current,
          presets: [SwaggerUIBundle.presets.apis, window.SwaggerUIStandalonePreset].filter(Boolean),
          plugins: [SwaggerUIBundle.plugins.DownloadUrl],
          layout: 'StandaloneLayout',
          deepLinking: true,
        })
        setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Failed to load the API reference.')
          setLoading(false)
        }
      }
    }

    mount()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/admin"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Hub
      </Link>

      <h1 className="mb-6 text-2xl font-semibold tracking-tight">API Docs</h1>

      {loading && (
        <div className="text-muted-foreground flex justify-center p-16 text-sm">Loading…</div>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {/* swagger-ui ships its own light-themed chrome; wrap in a white
          surface with explicit black text so it renders cleanly regardless
          of this app's (dark-capable) theme. */}
      <div className="rounded-xl bg-white p-2 text-black" ref={containerRef} />
    </div>
  )
}
