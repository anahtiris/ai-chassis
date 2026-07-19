import { redirect } from 'next/navigation'
import { auth, signOut } from '@/auth'
import { hasPermission } from '@/lib/auth/permissions'
import { AdminShell } from '@/components/admin/AdminShell'

// Wraps every /admin/* page that isn't a stand-alone top-level destination
// (the /admin hub landing and /admin/login live outside this route group —
// see app/admin/page.tsx and app/admin/login/page.tsx). Each wrapped page
// still does its own redirect/permission check too (defense in depth, and
// they predate this layout) — this is what actually drives the sidebar.
export default async function AdminShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  const [canViewAuditLog, canViewFormResults, canManageAi, canViewAnalytics] = await Promise.all([
    hasPermission(session.user.id, 'AUDIT_LOG_ACCESS'),
    hasPermission(session.user.id, 'FORM_RESULTS_ACCESS'),
    hasPermission(session.user.id, 'AI_MANAGEMENT'),
    hasPermission(session.user.id, 'ANALYTICS_ACCESS'),
  ])

  const visibleKeys = [
    'dashboard',
    session.user.isOwner ? 'users' : null,
    canViewAuditLog ? 'auditLogs' : null,
    canViewFormResults ? 'formResults' : null,
    canManageAi ? 'aiPrompts' : null,
    canManageAi ? 'aiConversations' : null,
    canViewAnalytics ? 'analytics' : null,
  ].filter((key): key is string => key !== null)

  async function handleSignOut() {
    'use server'
    await signOut({ redirectTo: '/admin/login' })
  }

  return (
    <AdminShell
      visibleKeys={visibleKeys}
      userLabel={session.user.email ?? session.user.name ?? null}
      isOwner={session.user.isOwner}
      onSignOut={handleSignOut}
    >
      {children}
    </AdminShell>
  )
}
