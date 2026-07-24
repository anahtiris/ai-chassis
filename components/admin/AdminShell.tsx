'use client'

/**
 * Admin portal layout: a fixed sidebar (module navigation) + a top navbar
 * (page title, user, sign out). Wraps every /admin/* page under the
 * app/admin/(shell) route group — NOT the /admin hub landing or
 * /admin/login, which stand alone (see app/admin/(shell)/layout.tsx and
 * app/admin/page.tsx).
 *
 * Deliberately simpler than the POC version this was generalized from: no
 * collapse-to-icons toggle, no separate mobile nav strip — just the sidebar
 * and the navbar, per docs/decisions.md "AdminShell: sidebar + navbar,
 * nothing more."
 */
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  ScrollText,
  ClipboardList,
  Bot,
  MessagesSquare,
  BarChart3,
} from 'lucide-react'
import { t, tCommon } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface NavItem {
  key: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

// 'dashboard' is always visible (any authenticated admin, no permission
// gate) — it's the Administration hub card's landing spot. Every other item
// is filtered by `visibleKeys`, computed server-side in
// app/admin/(shell)/layout.tsx from the signed-in user's permissions.
const NAV: NavItem[] = [
  { key: 'dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { key: 'users', href: '/admin/users', icon: Users },
  { key: 'auditLogs', href: '/admin/audit-logs', icon: ScrollText },
  { key: 'formResults', href: '/admin/form-results', icon: ClipboardList },
  { key: 'aiPrompts', href: '/admin/ai/prompts', icon: Bot },
  { key: 'aiConversations', href: '/admin/ai/conversations', icon: MessagesSquare },
  { key: 'analytics', href: '/admin/analytics', icon: BarChart3 },
]

function titleFor(pathname: string, items: NavItem[]): string {
  const match = [...items]
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]
  return match ? t(`nav.${match.key}`) : t('nav.administration')
}

export function AdminShell({
  children,
  visibleKeys,
  userLabel,
  isOwner,
  onSignOut,
}: {
  children: React.ReactNode
  visibleKeys: string[]
  userLabel: string | null
  isOwner: boolean
  onSignOut: () => Promise<void>
}) {
  const pathname = usePathname() ?? ''
  const items = NAV.filter((item) => visibleKeys.includes(item.key))
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="border-border bg-card sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r p-3 md:flex">
        <Link href="/admin" className="mb-4 flex items-center gap-2 px-2 py-1">
          <span className="text-sm font-semibold">{tCommon('appName')}</span>
        </Link>

        <nav className="flex w-full flex-col gap-0.5">
          {items.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{t(`nav.${item.key}`)}</span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background sticky top-0 z-20 flex items-center justify-between gap-4 border-b px-6 py-3">
          <h1 className="truncate text-lg font-semibold">{titleFor(pathname, items)}</h1>
          <div className="flex items-center gap-3">
            {userLabel && (
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {userLabel}
                {isOwner && (
                  <Badge variant="secondary" className="ml-2">
                    {tCommon('owner')}
                  </Badge>
                )}
              </span>
            )}
            <form action={onSignOut}>
              <Button type="submit" variant="ghost" size="sm">
                {t('buttons.signOut')}
              </Button>
            </form>
          </div>
        </header>

        <div className="min-w-0 flex-1 p-6">{children}</div>
      </div>
    </div>
  )
}
