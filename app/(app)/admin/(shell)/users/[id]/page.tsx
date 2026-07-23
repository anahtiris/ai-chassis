import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/client";
import {
  BUILTIN_PERMISSIONS,
  canManageTarget,
  canManageUsers,
  isBuiltinPermission,
} from "@/lib/auth/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// Shared authorization gate for this page and every server action on it.
// Reachable by owners + USER_MANAGEMENT holders (canManageUsers), then a
// per-target check (canManageTarget): owner accounts are untouchable by anyone
// but that same owner. Returns null when the acting user may not manage the
// target — callers redirect (render path) or throw (server actions). Server
// actions re-run this because each is an independent entrypoint, not gated by
// the page render.
async function loadTarget(targetId: string) {
  const session = await auth();
  if (!session?.user) return null;
  if (!(await canManageUsers(session.user.id))) return null;

  const target = await prisma.user.findFirst({
    where: { id: targetId, archived_at: null },
    include: {
      permissions: { where: { archived_at: null, status: "Active" } },
    },
  });
  if (!target) return null;

  const actor = { id: session.user.id, isOwner: session.user.isOwner };
  if (!canManageTarget(actor, target)) return null;

  return { session, actor, target };
}

// Per-user editor — reached from /admin/users. Non-owner targets get a profile
// (name/email) editor, a permission editor (built-in checkboxes reconciled by
// one Save action, plus a free-text custom escape hatch), and a soft-delete.
// Owner targets — only ever viewable by that same owner — get the profile
// editor only: owners bypass the permission table entirely and can never be
// deleted.
export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; profile?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, profile, error } = await searchParams;

  const loaded = await loadTarget(id);
  if (!loaded) redirect("/admin/users");
  const { session, target: user } = loaded;

  const isSelf = session.user.id === user.id;
  const grantedKeys = new Set(user.permissions.map((p) => p.permission));
  const customPermissions = user.permissions.filter(
    (p) => !isBuiltinPermission(p.permission),
  );

  async function saveProfile(formData: FormData) {
    "use server";
    const auth_ = await loadTarget(id);
    if (!auth_) throw new Error("Not authorized");

    const name = formData.get("name");
    const email = formData.get("email");
    if (typeof email !== "string" || !email.trim()) {
      redirect(`/admin/users/${id}?error=email-required`);
    }
    const trimmedEmail = (email as string).trim();
    const trimmedName =
      typeof name === "string" && name.trim() ? name.trim() : null;

    const clash = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (clash && clash.id !== id) {
      redirect(`/admin/users/${id}?error=email-exists`);
    }

    const before = { email: auth_.target.email, name: auth_.target.name };
    await prisma.user.update({
      where: { id },
      data: { email: trimmedEmail, name: trimmedName },
    });
    await prisma.auditLog.create({
      data: {
        entity_type: "User",
        entity_id: id,
        action: "update",
        actor: auth_.session.user.email ?? auth_.session.user.id,
        before,
        after: { email: trimmedEmail, name: trimmedName },
      },
    });

    revalidatePath(`/admin/users/${id}`);
    redirect(`/admin/users/${id}?profile=1`);
  }

  async function deleteUser() {
    "use server";
    const auth_ = await loadTarget(id);
    if (!auth_) throw new Error("Not authorized");
    // Belt-and-braces: canManageTarget already blocks owner targets, and a
    // user can't soft-delete themselves (would lock themselves out).
    if (auth_.target.is_owner) throw new Error("Owners cannot be deleted");
    if (auth_.session.user.id === id) {
      redirect(`/admin/users/${id}?error=no-self-delete`);
    }

    await prisma.user.update({
      where: { id },
      data: { archived_at: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        entity_type: "User",
        entity_id: id,
        action: "delete",
        actor: auth_.session.user.email ?? auth_.session.user.id,
        before: { email: auth_.target.email, name: auth_.target.name },
      },
    });

    revalidatePath("/admin/users");
    redirect("/admin/users?deleted=1");
  }

  async function saveBuiltins(formData: FormData) {
    "use server";
    const auth_ = await loadTarget(id);
    if (!auth_) throw new Error("Not authorized");
    if (auth_.target.is_owner) throw new Error("Owners bypass permissions");

    const desired = new Set(
      formData
        .getAll("permissions")
        .filter((v): v is string => typeof v === "string"),
    );
    const actor = auth_.session.user.email ?? auth_.session.user.id;

    for (const { key } of BUILTIN_PERMISSIONS) {
      const has = await prisma.userPermission.findFirst({
        where: {
          user_id: id,
          permission: key,
          status: "Active",
          archived_at: null,
        },
      });

      if (desired.has(key) && !has) {
        await prisma.userPermission.upsert({
          where: { user_id_permission: { user_id: id, permission: key } },
          update: { status: "Active", archived_at: null, effective_to: null },
          create: { user_id: id, permission: key },
        });
        await prisma.auditLog.create({
          data: {
            entity_type: "UserPermission",
            entity_id: id,
            action: "grant",
            actor,
            after: { permission: key },
          },
        });
      } else if (!desired.has(key) && has) {
        await prisma.userPermission.update({
          where: { id: has.id },
          data: { status: "Archived", archived_at: new Date() },
        });
        await prisma.auditLog.create({
          data: {
            entity_type: "UserPermission",
            entity_id: id,
            action: "revoke",
            actor,
            before: { permission: key },
          },
        });
      }
    }

    revalidatePath(`/admin/users/${id}`);
    redirect(`/admin/users/${id}?saved=1`);
  }

  async function addCustomPermission(formData: FormData) {
    "use server";
    const auth_ = await loadTarget(id);
    if (!auth_) throw new Error("Not authorized");
    if (auth_.target.is_owner) throw new Error("Owners bypass permissions");

    const permission = formData.get("permission");
    if (typeof permission !== "string") return;
    const trimmed = permission.trim();
    if (!trimmed) return;
    // Built-ins have their own checkboxes — don't let them be added here too.
    if (isBuiltinPermission(trimmed)) {
      redirect(`/admin/users/${id}?error=builtin-custom`);
    }

    await prisma.userPermission.upsert({
      where: { user_id_permission: { user_id: id, permission: trimmed } },
      update: { status: "Active", archived_at: null, effective_to: null },
      create: { user_id: id, permission: trimmed },
    });
    await prisma.auditLog.create({
      data: {
        entity_type: "UserPermission",
        entity_id: id,
        action: "grant",
        actor: auth_.session.user.email ?? auth_.session.user.id,
        after: { permission: trimmed },
      },
    });

    revalidatePath(`/admin/users/${id}`);
  }

  async function revokePermission(formData: FormData) {
    "use server";
    const auth_ = await loadTarget(id);
    if (!auth_) throw new Error("Not authorized");

    const permissionId = formData.get("permissionId");
    if (typeof permissionId !== "string") return;

    const existing = await prisma.userPermission.findUnique({
      where: { id: permissionId },
    });
    if (!existing || existing.user_id !== id) return;

    await prisma.userPermission.update({
      where: { id: permissionId },
      data: { status: "Archived", archived_at: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        entity_type: "UserPermission",
        entity_id: id,
        action: "revoke",
        actor: auth_.session.user.email ?? auth_.session.user.id,
        before: { permission: existing.permission },
      },
    });

    revalidatePath(`/admin/users/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/admin/users"
        className="text-muted-foreground text-sm underline-offset-4 hover:underline"
      >
        ← Back to users
      </Link>

      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">{user.name ?? user.email}</h1>
        {user.is_owner && <Badge variant="secondary">Owner</Badge>}
        {isSelf && <Badge variant="outline">You</Badge>}
      </div>

      {profile && <p className="text-sm text-green-700">Profile saved.</p>}
      {saved && <p className="text-sm text-green-700">Permissions saved.</p>}
      {error === "email-exists" && (
        <p className="text-destructive text-sm">
          A user with that email already exists.
        </p>
      )}
      {error === "email-required" && (
        <p className="text-destructive text-sm">Email is required.</p>
      )}
      {error === "no-self-delete" && (
        <p className="text-destructive text-sm">
          You can&apos;t delete your own account.
        </p>
      )}
      {error === "builtin-custom" && (
        <p className="text-destructive text-sm">
          That is a built-in permission — use its checkbox instead.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveProfile} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                name="name"
                type="text"
                defaultValue={user.name ?? ""}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                name="email"
                type="email"
                defaultValue={user.email}
                required
              />
            </div>
            <Button type="submit" size="sm" className="self-start">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      {!user.is_owner && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Built-in permissions</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveBuiltins} className="flex flex-col gap-4">
                {BUILTIN_PERMISSIONS.map((perm) => (
                  <label key={perm.key} className="flex items-start gap-3">
                    <Checkbox
                      name="permissions"
                      value={perm.key}
                      defaultChecked={grantedKeys.has(perm.key)}
                      className="mt-0.5"
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">{perm.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {perm.description}
                      </span>
                    </span>
                  </label>
                ))}
                <Button type="submit" size="sm" className="self-start">
                  Save
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Custom permissions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-muted-foreground text-xs">
                Project-defined permission strings checked via{" "}
                <code className="bg-muted rounded px-1 py-0.5">
                  hasPermission()
                </code>
                . Only add these if your fork gates something on them.
              </p>
              {customPermissions.length === 0 && (
                <p className="text-muted-foreground text-sm">None.</p>
              )}
              {customPermissions.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {customPermissions.map((permission) => (
                    <li key={permission.id}>
                      <form action={revokePermission} className="inline-flex">
                        <input
                          type="hidden"
                          name="permissionId"
                          value={permission.id}
                        />
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
              <form action={addCustomPermission} className="flex gap-2">
                <Input
                  name="permission"
                  placeholder="e.g. CONTENT_MANAGEMENT"
                  required
                />
                <Button type="submit" size="sm">
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

          {!isSelf && (
            <Card>
              <CardHeader>
                <CardTitle className="text-destructive text-sm">
                  Danger zone
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  Soft-deletes this user (sets <code>archived_at</code>). They
                  lose all access immediately and disappear from the list; the
                  row and its audit history are kept.
                </p>
                <form action={deleteUser}>
                  <Button type="submit" size="sm" variant="destructive">
                    Delete user
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
