import type { ReactNode } from 'react'

// Deliberately imports no CSS — this is the one layout shared by every
// section of the app (admin, Payload, and eventually public content), so it
// stays theme-agnostic. Each section owns its own Tailwind entry file,
// imported from that section's own layout instead: app/admin/layout.tsx and
// app/(payload)/layout.tsx both import app/globals.css (the admin/Payload
// theme); a future public content section gets its own separate CSS file
// and @theme. See docs/decisions.md "Separate Tailwind themes per section."

export const metadata = {
  title: 'ai-chassis',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
