import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { t, tCommon } from "@/lib/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STORYBOOK_URL =
  process.env.NEXT_PUBLIC_STORYBOOK_URL ?? "http://localhost:6006";

// The /admin hub: header + four top-level destination cards. Deliberately
// NOT wrapped by AdminShell — mirrors the POC's own layout.tsx comment
// ("/admin ... stand[s] alone"), since this page IS the thing AdminShell's
// sidebar links back to, not a page inside it.
//
// Kept deliberately small — every specific admin section (Users, Audit Log,
// AI Prompts, etc.) lives one level down, inside Administration's own
// sidebar (see components/admin/AdminShell.tsx), permission-gated there.
// This page itself has no per-card permission gate: all four are "any
// signed-in admin" destinations, same as the POC's original hub.
const CARDS = [
  { key: "administration", href: "/admin/dashboard" },
  { key: "cms", href: "/admin/cms" },
  { key: "storybook", href: STORYBOOK_URL, external: true },
  { key: "openapi", href: "/admin/api-docs" },
  { key: "settings", href: "/admin/settings" },
] as const;

export default async function AdminHubPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/admin/login" });
  }

  return (
    <main className="bg-background min-h-screen">
      <header className="border-border flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-muted-foreground text-xs">{t("hub.eyebrow")}</p>
          <h1 className="text-xl font-semibold">
            {t("hub.heading")} {t("hub.headingAccent")}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {t("hub.greeting")} {session.user.email ?? session.user.name}
            {session.user.isOwner && (
              <Badge variant="secondary" className="ml-2">
                {tCommon("owner")}
              </Badge>
            )}
          </span>
          <form action={handleSignOut}>
            <Button type="submit" variant="ghost" size="sm">
              {t("buttons.signOut")}
            </Button>
          </form>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            {...("external" in card && card.external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            <Card className="hover:border-primary/50 h-full transition-colors">
              <CardHeader>
                <CardTitle>{t(`hub.cards.${card.key}.title`)}</CardTitle>
                <CardDescription>
                  {t(`hub.cards.${card.key}.description`)}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
