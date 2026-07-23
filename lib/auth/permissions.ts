import { prisma } from "@/lib/db/client";

// The toolkit's own built-in permission strings — the ones that gate the
// bundled admin areas (see each page's hasPermission() call + the shell nav
// in app/(app)/admin/(shell)/layout.tsx). This is the single source of truth
// the users UI renders as checkboxes.
//
// This does NOT contradict "no fixed permission set" (see prisma/schema.prisma
// UserPermission comment): permission is still a free-text column, hasPermission()
// still takes any string, and a fork can grant custom permissions via the
// "custom permission" escape hatch on the per-user page. This list only names
// the permissions THIS toolkit ships wired up, so they get a nice checkbox
// instead of forcing the operator to retype the exact magic string. Forks add
// their own gated areas by adding an entry here (for a checkbox) or just
// granting the custom string directly.
export const BUILTIN_PERMISSIONS = [
  {
    key: "AUDIT_LOG_ACCESS",
    label: "Audit log",
    description: "View the audit log of changes across the admin.",
  },
  {
    key: "FORM_RESULTS_ACCESS",
    label: "Form results",
    description: "View submissions captured through forms.",
  },
  {
    key: "AI_MANAGEMENT",
    label: "AI management",
    description: "Manage AI prompts and review concierge conversations.",
  },
  {
    key: "ANALYTICS_ACCESS",
    label: "Analytics",
    description: "View the analytics dashboard.",
  },
  {
    key: "USER_MANAGEMENT",
    label: "User management",
    description:
      "Add, edit, and soft-delete users, and manage their permissions. Cannot touch owner accounts.",
  },
] as const;

export type BuiltinPermissionKey = (typeof BUILTIN_PERMISSIONS)[number]["key"];

const BUILTIN_KEYS: ReadonlySet<string> = new Set(
  BUILTIN_PERMISSIONS.map((p) => p.key),
);

export function isBuiltinPermission(permission: string): boolean {
  return BUILTIN_KEYS.has(permission);
}

// True if the user may reach /admin/users at all: owners (full bypass) plus
// anyone holding USER_MANAGEMENT. What they can then do to a *specific* target
// is a further check (owners are untouchable by anyone but themselves) — see
// canManageTarget() below.
export async function canManageUsers(userId: string): Promise<boolean> {
  return hasPermission(userId, "USER_MANAGEMENT");
}

// Per-target authorization on top of canManageUsers(). Owner accounts are
// untouchable by anyone other than that same owner (self-edit only, and even
// then never deletable) — see app/(app)/admin/(shell)/users. `target` is the
// user being acted on; `actor` is the signed-in user.
export function canManageTarget(
  actor: { id: string; isOwner: boolean },
  target: { id: string; is_owner: boolean },
): boolean {
  if (target.is_owner) return actor.id === target.id;
  return true;
}

// The shared permission-check module referenced throughout docs/decisions.md
// ("Auth/permission checking implemented once") — session *verification*
// happens once, in auth.ts; this is the per-area *authorization* check that
// runs on top of it, imported by admin route handlers/pages as needed.
//
// `is_owner` is a full bypass, not a permission grant — this toolkit
// deliberately doesn't hardcode a fixed permission set (see
// prisma/schema.prisma's comment on UserPermission), so there's no fixed
// list to grant "all of." Everyone else needs an explicit, currently-active
// UserPermission row for the specific permission being checked.
export async function hasPermission(
  userId: string,
  permission: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.archived_at) return false;
  if (user.is_owner) return true;

  const now = new Date();
  const grant = await prisma.userPermission.findFirst({
    where: {
      user_id: userId,
      permission,
      status: "Active",
      effective_from: { lte: now },
      OR: [{ effective_to: null }, { effective_to: { gte: now } }],
    },
  });
  return grant !== null;
}
