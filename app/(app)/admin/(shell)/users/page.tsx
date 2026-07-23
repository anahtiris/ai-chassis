import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/client";
import { canManageUsers, canManageTarget } from "@/lib/auth/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Reachable by owners and USER_MANAGEMENT holders (canManageUsers). What a
// viewer may then DO to a specific row is a further, per-target check: owner
// accounts are untouchable by anyone but themselves (canManageTarget), so
// their "Manage" link only appears to that same owner. Per-user editing and
// permission management live on the [id] subpage.
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; deleted?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");
  if (!(await canManageUsers(session.user.id))) redirect("/admin");

  const actor = { id: session.user.id, isOwner: session.user.isOwner };
  const { error, created, deleted } = await searchParams;

  const users = await prisma.user.findMany({
    where: { archived_at: null },
    include: {
      permissions: { where: { archived_at: null, status: "Active" } },
    },
    orderBy: { created_at: "asc" },
  });

  async function createUser(formData: FormData) {
    "use server";
    const actingSession = await auth();
    if (
      !actingSession?.user ||
      !(await canManageUsers(actingSession.user.id))
    ) {
      throw new Error("Not authorized");
    }

    const name = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");
    if (typeof email !== "string" || !email.trim()) return;
    if (typeof password !== "string" || !password) return;

    const trimmedEmail = email.trim();
    const trimmedName =
      typeof name === "string" && name.trim() ? name.trim() : null;

    const existing = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existing) {
      redirect("/admin/users?error=email-exists");
    }

    if (password.length < 8) {
      redirect("/admin/users?error=password-too-short");
    }

    // A user created here is never the owner — bootstrap (auth.ts's signIn
    // callback) is the only path that sets is_owner.
    const password_hash = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: trimmedEmail,
        name: trimmedName,
        password_hash,
        is_owner: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        entity_type: "User",
        entity_id: user.id,
        action: "create",
        actor: actingSession.user.email ?? actingSession.user.id,
        after: {
          email: user.email,
          name: user.name,
          hasPassword: Boolean(password_hash),
        },
      },
    });

    revalidatePath("/admin/users");
    redirect("/admin/users?created=1");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-muted-foreground text-sm">
        Add users and manage their access. Owner accounts can only be edited by
        that owner and can never be deleted.
      </p>

      {error && (
        <p className="text-destructive text-sm">
          {error === "email-exists"
            ? "A user with that email already exists."
            : error === "password-too-short"
              ? "Password must be at least 8 characters."
              : `Something went wrong (${error}).`}
        </p>
      )}
      {created && <p className="text-sm text-green-700">User created.</p>}
      {deleted && <p className="text-sm text-green-700">User deleted.</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Add user</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createUser} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-name">Name</Label>
              <Input
                id="new-user-name"
                name="name"
                type="text"
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
              />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const manageable = canManageTarget(actor, user);
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.is_owner ? (
                        <Badge variant="secondary">Owner — all access</Badge>
                      ) : user.permissions.length === 0 ? (
                        <span className="text-muted-foreground text-sm">
                          No permissions
                        </span>
                      ) : (
                        <span className="text-sm">
                          {user.permissions.length} permission
                          {user.permissions.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {manageable ? (
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="text-primary text-sm underline-offset-4 hover:underline"
                        >
                          Manage →
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
