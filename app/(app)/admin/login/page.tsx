import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, oauthProviders } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Renders for anyone proxy.ts redirects here (see proxy.ts's isLoginRoute
// check). Credentials is the default, primary form; every configured
// external IdP is rendered below it, one button each, from auth.ts's
// `oauthProviders` — so adding an IdP is an env change with no edit here.
// See docs/decisions.md "Default auth provider".
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function authenticateWithCredentials(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/admin",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect("/admin/login?error=invalid-credentials");
      }
      throw err;
    }
  }

  // One action for every IdP button, taking the provider from the submitted
  // form. The id is checked against the configured list rather than passed
  // straight through — a form field is caller-controlled, and signIn() would
  // otherwise accept any provider name the client cares to send.
  async function authenticateWithProvider(formData: FormData) {
    "use server";
    const providerId = formData.get("providerId");
    if (
      typeof providerId !== "string" ||
      !oauthProviders.some((provider) => provider.id === providerId)
    ) {
      redirect("/admin/login?error=unknown-provider");
    }
    await signIn(providerId, { redirectTo: "/admin" });
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
              {error === "invalid-credentials"
                ? "That email/password combination didn't work."
                : `Sign-in failed (${error}). Check the pnpm dev terminal for the underlying error.`}
            </p>
          )}

          <form
            action={authenticateWithCredentials}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                name="email"
                type="email"
                required
                autoComplete="username"
              />
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

          {oauthProviders.map((provider) => (
            <form key={provider.id} action={authenticateWithProvider}>
              <input type="hidden" name="providerId" value={provider.id} />
              <Button type="submit" variant="outline" className="w-full">
                {provider.label}
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
