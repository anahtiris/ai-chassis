import { redirect } from 'next/navigation'

// Registered as payload.config.ts's admin.components.beforeLogin. Payload's
// own login view expects local-strategy fields (email/password), but the
// `users` collection has disableLocalStrategy: true (see
// lib/payload/collections/users.ts) — there's nothing for that form to do.
// In normal use this is unreachable anyway (proxy.ts already gates all of
// /admin/*, including /admin/cms, behind a valid Auth.js session before
// Payload's own admin ever renders), but if it's ever hit directly — a
// stale session cookie mid-navigation, for instance — redirect to the real
// login page instead of showing a broken form. Ported from the POC's
// AzureLogin component, generalized off Entra ID specifically since
// Credentials is this toolkit's default provider.
export default function RedirectToLogin() {
  redirect('/admin/login')
}
