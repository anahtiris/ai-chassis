import Link from 'next/link'
import { LogOut } from 'lucide-react'

// Replaces Payload's default logout button in the /admin/cms sidebar (see
// payload.config.ts's admin.components.logout.Button). Payload's own
// logout only clears its own internal cookie — since authentication is
// delegated entirely to the Auth.js session (see lib/payload/authStrategy.ts),
// re-visiting /admin/cms would just sign back in immediately via the same
// Auth.js cookie, so a real "log out of Payload" action isn't meaningful on
// its own. This just returns to the /admin hub, where the toolkit's real
// sign-out (Auth.js's signOut(), which does end the shared session) lives.
// `nav__log-out` keeps Payload's own sidebar icon-button styling.
export function BackToHubButton() {
  return (
    <Link aria-label="Back to hub" className="nav__log-out" href="/admin" title="Back to hub">
      <LogOut size={20} />
    </Link>
  )
}
