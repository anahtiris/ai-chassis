import type { ReactNode } from "react";
import "@/app/globals.css";

// Wraps all of /admin/* — the hub, /admin/login, api-docs, and every page
// inside app/(app)/admin/(shell)/ — so the admin/Payload Tailwind theme
// (app/globals.css) loads once for the whole section instead of the root
// layout importing it globally. See app/(app)/layout.tsx and
// docs/decisions.md "Separate Tailwind themes per section."
export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
