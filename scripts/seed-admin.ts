// One-time bootstrap for a fresh fork: creates (or resets the password of)
// an admin user so there's someone who can actually log into /admin/login
// via the Credentials provider. Run once against a fresh database, or
// again any time to reset a password.
//
//   pnpm seed:admin you@example.com 'a-real-password'
//
// Whether that user can *do* anything once logged in depends on the
// UserPermission rows granted separately — this script only handles
// authentication, not authorization.
// Default import, not `{ hash }` — bcryptjs's CJS entry re-exports via
// `module.exports = require(...)`, which cjs-module-lexer (tsx/Node ESM
// interop) can't see through to detect named exports, unlike webpack's
// bundling of the same import in auth.ts.
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/db/client'

async function main() {
  const [, , email, password] = process.argv

  if (!email || !password) {
    console.error('Usage: pnpm seed:admin <email> <password>')
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(1)
  }

  const password_hash = await bcrypt.hash(password, 12)
  // Mirrors auth.ts's signIn callback bootstrap rule: whichever user gets
  // created first — via this script or via a first Entra ID login — becomes
  // owner. Only applies on create; running this again to reset an existing
  // user's password doesn't change their existing is_owner value either way.
  const isFirstUser = (await prisma.user.count()) === 0

  const user = await prisma.user.upsert({
    where: { email },
    update: { password_hash, archived_at: null },
    create: { email, password_hash, is_owner: isFirstUser },
  })

  console.log(`Admin user ready: ${user.email} (${user.id})${user.is_owner ? ' — owner' : ''}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
