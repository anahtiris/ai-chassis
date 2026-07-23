import type { ReactNode } from "react";

// Independent root layout for this route group — see docs/decisions.md
// "Multiple root layouts: Payload's RootLayout can't be nested." Next.js's
// App Router only allows one <html>/<body> pair per branch of the layout
// tree; app/(payload)/layout.tsx renders its own (via @payloadcms/next's
// RootLayout, which has no opt-out for that), so this group needs its own
// independent root instead of sharing a single top-level app/layout.tsx
// with Payload's routes. Deliberately imports no CSS — every section under
// here owns its own Tailwind entry file, imported from that section's own
// nested layout instead: app/(app)/admin/layout.tsx imports
// app/globals.css (the admin theme); a future public content layout gets
// its own separate CSS file and @theme. See docs/decisions.md "Separate
// Tailwind themes per section."

export const metadata = {
  title: "ai-chassis",
};

export default function AppRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
