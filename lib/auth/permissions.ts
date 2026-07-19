import { prisma } from '@/lib/db/client'

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
export async function hasPermission(userId: string, permission: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.archived_at) return false
  if (user.is_owner) return true

  const now = new Date()
  const grant = await prisma.userPermission.findFirst({
    where: {
      user_id: userId,
      permission,
      status: 'Active',
      effective_from: { lte: now },
      OR: [{ effective_to: null }, { effective_to: { gte: now } }],
    },
  })
  return grant !== null
}
