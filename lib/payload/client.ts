import { getPayload } from 'payload'
import config from '@/payload.config'

// Singleton, same reasoning as lib/db/client.ts's Prisma client — avoids
// re-initializing Payload (expensive) on every request. `cron: true` is
// required for payloadcms-vectorize's realtime embedding queue to actually
// process jobs, per its own troubleshooting docs — see
// docs/decisions.md "RAG implementation" for a caveat on what this does and
// doesn't guarantee about when embedding jobs actually run.
const globalForPayload = globalThis as unknown as {
  payloadClient?: ReturnType<typeof getPayload>
}

export function getPayloadClient(): ReturnType<typeof getPayload> {
  if (!globalForPayload.payloadClient) {
    globalForPayload.payloadClient = getPayload({ config, cron: true })
  }
  return globalForPayload.payloadClient
}
