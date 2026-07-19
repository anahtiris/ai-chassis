import { redirect } from 'next/navigation'
import { auth } from '@/auth'

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
        {session.user.isOwner ? ' (owner)' : ''}. Use the sidebar to get to a section.
      </p>
    </div>
  )
}
