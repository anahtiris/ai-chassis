import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { signIn } from '@/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

// Renders for anyone proxy.ts redirects here (see proxy.ts's isLoginRoute
// check). Credentials is the default, primary form; Microsoft Entra ID is a
// secondary, optional button that only does anything once
// AUTH_MICROSOFT_ENTRA_ID_* is configured — see docs/decisions.md "Default
// auth provider".
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  async function authenticateWithCredentials(formData: FormData) {
    'use server'
    try {
      await signIn('credentials', {
        email: formData.get('email'),
        password: formData.get('password'),
        redirectTo: '/admin',
      })
    } catch (err) {
      if (err instanceof AuthError) {
        redirect('/admin/login?error=invalid-credentials')
      }
      throw err
    }
  }

  async function authenticateWithEntraId() {
    'use server'
    await signIn('microsoft-entra-id', { redirectTo: '/admin' })
  }

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Admin sign in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p className="text-destructive text-sm">
              {error === 'invalid-credentials'
                ? "That email/password combination didn't work."
                : `Sign-in failed (${error}). Check the pnpm dev terminal for the underlying error.`}
            </p>
          )}

          <form action={authenticateWithCredentials} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" name="email" type="email" required autoComplete="username" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="mt-1">
              Sign in
            </Button>
          </form>

          <form action={authenticateWithEntraId}>
            <Button type="submit" variant="outline" className="w-full">
              Sign in with Microsoft
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
