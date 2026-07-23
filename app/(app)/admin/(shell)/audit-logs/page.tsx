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

// First page in this toolkit gated by a real fine-grained permission rather
// than the is_owner bypass — see lib/auth/permissions.ts. "AUDIT_LOG_ACCESS"
// is just this toolkit's own default string for its own generic page;
// projects define whatever permission strings make sense for their own
// business-specific pages on top of this.
export default async function AuditLogsPage() {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  const allowed = await hasPermission(session.user.id, 'AUDIT_LOG_ACCESS')
  if (!allowed) redirect('/admin')

  const logs = await prisma.auditLog.findMany({
    orderBy: { created_at: 'desc' },
    take: 100,
  })

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-muted-foreground text-sm">
        Most recent 100 entries. Grant a non-owner user the{' '}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">AUDIT_LOG_ACCESS</code>{' '}
        permission from Users &amp; Permissions to confirm this gate works for someone
        other than the owner.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-muted-foreground">
                {log.created_at.toISOString()}
              </TableCell>
              <TableCell>{log.actor}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>
                {log.entity_type} ({log.entity_id})
              </TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-6 text-center">
                No audit log entries yet — grant or revoke a permission on Users &amp;
                Permissions to generate one.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
