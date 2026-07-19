import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/client'
import { hasPermission } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Gated by AI_MANAGEMENT — same permission as
// app/admin/(shell)/ai/prompts/page.tsx. Read-only: reviewing what the
// concierge said, not editing history.
export default async function AiConversationsPage() {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  const allowed = await hasPermission(session.user.id, 'AI_MANAGEMENT')
  if (!allowed) redirect('/admin')

  const conversations = await prisma.aiConversation.findMany({
    orderBy: { created_at: 'desc' },
    take: 50,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">Most recent 50 concierge sessions.</p>

      {conversations.map((conversation) => (
        <Card key={conversation.id}>
          <CardHeader>
            <CardTitle className="text-sm font-normal">
              <span className="font-mono">{conversation.session_id}</span>{' '}
              <span className="text-muted-foreground">
                — {conversation.created_at.toISOString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <details>
              <summary className="text-muted-foreground cursor-pointer text-xs">
                View messages
              </summary>
              <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(conversation.messages, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      ))}
      {conversations.length === 0 && (
        <p className="text-muted-foreground text-sm">No conversations yet.</p>
      )}
    </div>
  )
}
