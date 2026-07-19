import { PrismaClient } from '@prisma/client'

// Standard Next.js Prisma singleton pattern — without this, hot reload in
// dev creates a new PrismaClient (and a new connection pool) on every file
// change, eventually exhausting Postgres's connection limit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
