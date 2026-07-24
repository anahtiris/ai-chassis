import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { compare, hash } from 'bcryptjs'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/client'
import { t } from '@/lib/i18n'
import { parseAppearance } from '@/lib/appearance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { AppearanceControls } from '@/components/settings/AppearanceControls'

// Reached from the /admin hub's "Settings" card — stands alone like the hub
// itself (not wrapped in AdminShell), since this is personal-account
// settings available to every signed-in user, not a permission-gated
// section. Only exposes a change-password form for accounts that already
// have a local (Credentials) password — see prisma/schema.prisma's
// User.password_hash comment: null means Entra ID-only, which has no local
// password to change here.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/admin/login')

  const { error, success } = await searchParams

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user) redirect('/admin/login')

  const hasLocalPassword = Boolean(user.password_hash)

  const cookieStore = await cookies()
  const appearance = parseAppearance((name) => cookieStore.get(name)?.value)

  async function changePassword(formData: FormData) {
    'use server'
    const actingSession = await auth()
    if (!actingSession?.user) throw new Error('Not authorized')

    const actingUser = await prisma.user.findUnique({ where: { id: actingSession.user.id } })
    if (!actingUser?.password_hash) redirect('/admin/settings')

    const currentPassword = formData.get('currentPassword')
    const newPassword = formData.get('newPassword')
    const confirmPassword = formData.get('confirmPassword')
    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmPassword !== 'string'
    ) {
      return
    }

    const matches = await compare(currentPassword, actingUser.password_hash)
    if (!matches) {
      redirect('/admin/settings?error=incorrect')
    }

    if (newPassword !== confirmPassword) {
      redirect('/admin/settings?error=mismatch')
    }

    if (newPassword.length < 8) {
      redirect('/admin/settings?error=too-short')
    }

    const password_hash = await hash(newPassword, 12)

    await prisma.user.update({
      where: { id: actingUser.id },
      data: { password_hash },
    })

    await prisma.auditLog.create({
      data: {
        entity_type: 'User',
        entity_id: actingUser.id,
        action: 'update',
        actor: actingSession.user.email ?? actingSession.user.id,
        after: { passwordChanged: true },
      },
    })

    redirect('/admin/settings?success=1')
  }

  return (
    <main className="bg-background min-h-screen p-6">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-xl font-semibold">{t('settings.heading')}</h1>
          <Link href="/admin" className="text-muted-foreground text-sm hover:underline">
            {t('settings.backToHub')}
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('settings.appearance.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <AppearanceControls
              initialTheme={appearance.theme}
              initialFont={appearance.font}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('settings.changePassword.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!hasLocalPassword && (
              <p className="text-muted-foreground text-sm">{t('settings.changePassword.ssoNotice')}</p>
            )}

            {hasLocalPassword && (
              <>
                {error && (
                  <p className="text-destructive text-sm">
                    {error === 'incorrect'
                      ? t('settings.changePassword.errorIncorrect')
                      : error === 'mismatch'
                        ? t('settings.changePassword.errorMismatch')
                        : error === 'too-short'
                          ? t('settings.changePassword.errorTooShort')
                          : `Something went wrong (${error}).`}
                  </p>
                )}
                {success && <p className="text-sm text-green-700">{t('settings.changePassword.success')}</p>}

                <form action={changePassword} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="current-password">{t('settings.changePassword.currentPassword')}</Label>
                    <Input
                      id="current-password"
                      name="currentPassword"
                      type="password"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-password">{t('settings.changePassword.newPassword')}</Label>
                    <Input
                      id="new-password"
                      name="newPassword"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="confirm-password">{t('settings.changePassword.confirmPassword')}</Label>
                    <Input
                      id="confirm-password"
                      name="confirmPassword"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" size="sm" className="self-start">
                    {t('settings.changePassword.submit')}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
