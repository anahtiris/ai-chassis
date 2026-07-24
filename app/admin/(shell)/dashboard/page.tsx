import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { tCommon } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'

// The Administration hub card's entry point — AdminShell's sidebar is the
// real navigation from here; this page itself is intentionally minimal, a
// landing spot rather than a dashboard with its own widgets.
export default async function AdminDashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-muted-foreground text-sm">
        Signed in as {session.user.email ?? session.user.name}
        {session.user.isOwner && (
          <Badge variant="secondary" className="ml-2">
            {tCommon('owner')}
          </Badge>
        )}
        . Use the sidebar to get to a section.
      </p>
    </div>
  )
}
