import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { FONT_SIZES, parseAppearance } from "@/lib/appearance";

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
//
// Appearance (theme + font-size) is applied on the <html> here from cookies
// set by /admin/settings (components/settings/AppearanceControls.tsx). Font
// size is fully server-rendered (no OS dependency). Theme is server-rendered
// when an explicit choice exists; when it doesn't ("System"), the inline
// script below applies the OS preference before first paint so it never
// flashes. Payload's own routes read the mirrored `payload-theme` cookie
// server-side instead (see payload.config.ts admin.theme).

export const metadata = {
  title: "ai-chassis",
};

// Render-blocking, runs only when no explicit `theme` cookie is set: adds
// `.dark` up front if the OS prefers dark, avoiding a light-then-dark flash
// for the "System" default.
const themeInitScript = `(function(){try{if(!/(?:^|; )theme=(light|dark)/.test(document.cookie)&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default async function AppRootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const store = await cookies();
  const { theme, font } = parseAppearance((name) => store.get(name)?.value);

  return (
    <html
      lang="en"
      className={theme === "dark" ? "dark" : undefined}
      style={{ fontSize: FONT_SIZES[font] }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
