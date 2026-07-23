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
import { Badge } from '@/components/ui/badge'

// Gated by FORM_RESULTS_ACCESS — same free-text-permission convention as
// AUDIT_LOG_ACCESS (see app/(app)/admin/(shell)/audit-logs/page.tsx). Read-only by
// design: what happens after a submission is captured (a lead pipeline,
// notifications, CRM sync, etc.) is project-specific and deliberately not
// part of this toolkit — see docs/decisions.md "FormSubmission" comment in
// prisma/schema.prisma.
export default async function FormResultsPage() {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  const allowed = await hasPermission(session.user.id, 'FORM_RESULTS_ACCESS')
  if (!allowed) redirect('/admin')

  const submissions = await prisma.formSubmission.findMany({
    where: { archived_at: null },
    orderBy: { created_at: 'desc' },
    take: 100,
  })

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <p className="text-muted-foreground text-sm">
        Most recent 100 submissions across all forms (grouped by{' '}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">form_key</code>).
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Form</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Payload</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((submission) => (
            <TableRow key={submission.id}>
              <TableCell className="text-muted-foreground">
                {submission.created_at.toISOString()}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{submission.form_key}</Badge>
              </TableCell>
              <TableCell>{submission.name ?? '—'}</TableCell>
              <TableCell>{submission.email ?? '—'}</TableCell>
              <TableCell>{submission.source ?? '—'}</TableCell>
              <TableCell>
                <details>
                  <summary className="text-muted-foreground cursor-pointer text-xs">
                    View
                  </summary>
                  <pre className="bg-muted mt-2 max-w-xs overflow-x-auto rounded p-2 text-xs whitespace-pre-wrap">
                    {JSON.stringify(submission.payload, null, 2)}
                  </pre>
                </details>
              </TableCell>
            </TableRow>
          ))}
          {submissions.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-6 text-center">
                No form submissions yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
