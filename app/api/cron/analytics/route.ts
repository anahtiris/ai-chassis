import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'

// Triggered by Vercel Cron on the schedule in vercel.json. Computes counts
// for the previous full day and writes them to AnalyticsSnapshot — never
// reads from that table in the same job, and the admin dashboard
// (app/admin/analytics/page.tsx) never reads anything but that table. See
// docs/decisions.md "Analytics: nightly snapshot job, dashboard never reads
// live tables."
//
// Local testing (Vercel Cron doesn't fire outside a Vercel deployment):
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:4000/api/cron/analytics
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { data: null, error: { code: 'unauthorized', message: 'Invalid or missing cron secret' } },
      { status: 401 },
    )
  }

  // Vercel Cron's own `schedule` field is always UTC, independent of this —
  // ANALYTICS_TIMEZONE only controls what counts as "yesterday" for the
  // metrics computed below. The two need to be reasoned about together per
  // project (e.g. a schedule of "0 17 * * *" fires at 00:00 in UTC+7).
  const timezone = process.env.ANALYTICS_TIMEZONE ?? 'UTC'

  const nowInTimezone = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
  nowInTimezone.setDate(nowInTimezone.getDate() - 1)
  const snapshotDate = new Date(
    Date.UTC(nowInTimezone.getFullYear(), nowInTimezone.getMonth(), nowInTimezone.getDate()),
  )
  const rangeStart = snapshotDate
  const rangeEnd = new Date(snapshotDate)
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1)

  const [formSubmissions, aiConversations, auditLogEntries] = await Promise.all([
    prisma.formSubmission.count({ where: { created_at: { gte: rangeStart, lt: rangeEnd } } }),
    prisma.aiConversation.count({ where: { created_at: { gte: rangeStart, lt: rangeEnd } } }),
    prisma.auditLog.count({ where: { created_at: { gte: rangeStart, lt: rangeEnd } } }),
  ])

  // Deliberately minimal — this toolkit only has domain-agnostic tables to
  // count. Add more entries here per project as real business models get
  // added; the (metric_key, value) shape doesn't need to change.
  const metrics = [
    { key: 'form_submissions_count', value: formSubmissions },
    { key: 'ai_conversations_count', value: aiConversations },
    { key: 'audit_log_entries_count', value: auditLogEntries },
  ]

  await Promise.all(
    metrics.map((metric) =>
      prisma.analyticsSnapshot.upsert({
        where: { snapshot_date_metric_key: { snapshot_date: snapshotDate, metric_key: metric.key } },
        update: { value: metric.value },
        create: { snapshot_date: snapshotDate, metric_key: metric.key, value: metric.value },
      }),
    ),
  )

  return NextResponse.json({ data: { snapshot_date: snapshotDate.toISOString(), metrics }, error: null })
}
