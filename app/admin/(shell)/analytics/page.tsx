import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/client'
import { hasPermission } from '@/lib/auth/permissions'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

// Gated by ANALYTICS_ACCESS. Reads only AnalyticsSnapshot rows, populated by
// app/api/cron/analytics/route.ts — never a live table directly. See
// docs/decisions.md "Analytics: nightly snapshot job, dashboard never reads
// live tables" for why that separation matters.
export default async function AnalyticsPage() {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  const allowed = await hasPermission(session.user.id, 'ANALYTICS_ACCESS')
  if (!allowed) redirect('/admin')

  const snapshots = await prisma.analyticsSnapshot.findMany({
    orderBy: [{ snapshot_date: 'desc' }, { metric_key: 'asc' }],
    take: 90,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">
        Populated nightly by <code className="bg-muted rounded px-1 py-0.5 text-xs">/api/cron/analytics</code>{' '}
        (see <code className="bg-muted rounded px-1 py-0.5 text-xs">vercel.json</code>). Empty
        until that job has run at least once — locally, trigger it manually:
        <br />
        <code className="bg-muted mt-2 block overflow-x-auto rounded p-2 text-xs">
          curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; http://localhost:4000/api/cron/analytics
        </code>
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Metric</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {snapshots.map((snapshot) => (
            <TableRow key={snapshot.id}>
              <TableCell className="text-muted-foreground">
                {snapshot.snapshot_date.toISOString().slice(0, 10)}
              </TableCell>
              <TableCell>{snapshot.metric_key}</TableCell>
              <TableCell>{snapshot.value}</TableCell>
            </TableRow>
          ))}
          {snapshots.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                No snapshots yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
