import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { hash } from 'bcryptjs'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

// Owner-only — not gated through lib/auth/permissions.ts's hasPermission(),
// deliberately. This page is what grants permissions in the first place, so
// letting a non-owner permission-holder reach it would be a privilege
// escalation path (grant themselves anything). Owners bypass the
// UserPermission table entirely (see docs/decisions.md "Bootstrap: first
// user is owner"); this page only does anything useful for everyone else.
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')
  if (!session.user.isOwner) redirect('/admin')

  const { error, created } = await searchParams

  const users = await prisma.user.findMany({
    where: { archived_at: null },
    include: { permissions: { where: { archived_at: null } } },
    orderBy: { created_at: 'asc' },
  })

  async function createUser(formData: FormData) {
    'use server'
    const actingSession = await auth()
    if (!actingSession?.user?.isOwner) throw new Error('Not authorized')

    const email = formData.get('email')
    const password = formData.get('password')
    if (typeof email !== 'string' || !email.trim()) return
    if (typeof password !== 'string' || !password) return

    const trimmedEmail = email.trim()

    const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } })
    if (existing) {
      redirect('/admin/users?error=email-exists')
    }

    if (password.length < 8) {
      redirect('/admin/users?error=password-too-short')
    }

    // This page only renders once bootstrap (auth.ts's signIn callback) has
    // already happened, so a user created here is never the owner.
    const password_hash = await hash(password, 12)

    const user = await prisma.user.create({
      data: { email: trimmedEmail, password_hash, is_owner: false },
    })

    await prisma.auditLog.create({
      data: {
        entity_type: 'User',
        entity_id: user.id,
        action: 'create',
        actor: actingSession.user.email ?? actingSession.user.id,
        after: { email: user.email, hasPassword: Boolean(password_hash) },
      },
    })

    revalidatePath('/admin/users')
    redirect('/admin/users?created=1')
  }

  async function grantPermission(formData: FormData) {
    'use server'
    const actingSession = await auth()
    if (!actingSession?.user?.isOwner) throw new Error('Not authorized')

    const userId = formData.get('userId')
    const permission = formData.get('permission')
    if (typeof userId !== 'string' || typeof permission !== 'string') return
    const trimmed = permission.trim()
    if (!trimmed) return

    await prisma.userPermission.upsert({
      where: { user_id_permission: { user_id: userId, permission: trimmed } },
      update: { status: 'Active', archived_at: null, effective_to: null },
      create: { user_id: userId, permission: trimmed },
    })

    await prisma.auditLog.create({
      data: {
        entity_type: 'UserPermission',
        entity_id: userId,
        action: 'grant',
        actor: actingSession.user.email ?? actingSession.user.id,
        after: { permission: trimmed },
      },
    })

    revalidatePath('/admin/users')
  }

  async function revokePermission(formData: FormData) {
    'use server'
    const actingSession = await auth()
    if (!actingSession?.user?.isOwner) throw new Error('Not authorized')

    const permissionId = formData.get('permissionId')
    if (typeof permissionId !== 'string') return

    const existing = await prisma.userPermission.findUnique({ where: { id: permissionId } })
    if (!existing) return

    await prisma.userPermission.update({
      where: { id: permissionId },
      data: { status: 'Archived', archived_at: new Date() },
    })

    await prisma.auditLog.create({
      data: {
        entity_type: 'UserPermission',
        entity_id: existing.user_id,
        action: 'revoke',
        actor: actingSession.user.email ?? actingSession.user.id,
        before: { permission: existing.permission },
      },
    })

    revalidatePath('/admin/users')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">
        Only visible to owners. Permission strings are free text — this toolkit
        doesn&apos;t hardcode a fixed permission set; each project defines its own and
        checks it via <code className="bg-muted rounded px-1 py-0.5 text-xs">lib/auth/permissions.ts</code>&apos;s{' '}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">hasPermission()</code>.
      </p>

      {error && (
        <p className="text-destructive text-sm">
          {error === 'email-exists'
            ? 'A user with that email already exists.'
            : error === 'password-too-short'
              ? 'Password must be at least 8 characters.'
              : `Something went wrong (${error}).`}
        </p>
      )}
      {created && <p className="text-sm text-green-700">User created.</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add user</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createUser} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <Input id="new-user-email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-password">Password</Label>
              <Input
                id="new-user-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" size="sm" className="self-start">
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      {users.map((user) => (
        <Card key={user.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              {user.email}
              {user.is_owner && (
                <Badge variant="secondary">Owner — bypasses permission checks</Badge>
              )}
            </CardTitle>
          </CardHeader>

          {!user.is_owner && (
            <CardContent className="flex flex-col gap-3">
              {user.permissions.length === 0 && (
                <p className="text-muted-foreground text-sm">No permissions granted.</p>
              )}
              {user.permissions.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {user.permissions.map((permission) => (
                    <li key={permission.id}>
                      <form action={revokePermission} className="inline-flex">
                        <input type="hidden" name="permissionId" value={permission.id} />
                        <Badge variant="outline" className="gap-1.5 pr-1">
                          {permission.permission}
                          <button
                            type="submit"
                            className="hover:text-destructive rounded-sm text-xs"
                            aria-label={`Revoke ${permission.permission}`}
                          >
                            ✕
                          </button>
                        </Badge>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <form action={grantPermission} className="flex gap-2">
                <input type="hidden" name="userId" value={user.id} />
                <Input name="permission" placeholder="e.g. CONTENT_MANAGEMENT" required />
                <Button type="submit" size="sm">
                  Grant
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}
