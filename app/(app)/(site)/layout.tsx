import Link from "next/link";
import type { ReactNode } from "react";

// Public content section (rendered Payload Pages/Posts). Imports globals.css
// so it shares the brand tokens + Tailwind theme (and the generative-ui-kit
// theme + @source registration that globals.css pulls in, which the on-page
// ConciergeWidget needs). Per docs/decisions.md "Separate Tailwind themes per
// section", a fork can later split this into its own content.css + @theme
// rather than sharing the admin theme; for the starter it reuses globals.css.
import "@/app/globals.css";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="text-foreground bg-background min-h-screen">
      <header className="border-b">
        <nav className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4 text-sm">
          <Link href="/" className="font-semibold">
            Acme
          </Link>
          <Link
            href="/about"
            className="text-muted-foreground hover:text-foreground"
          >
            About
          </Link>
          <Link
            href="/contact"
            className="text-muted-foreground hover:text-foreground"
          >
            Contact
          </Link>
          <Link
            href="/blog"
            className="text-muted-foreground hover:text-foreground"
          >
            Blog
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
