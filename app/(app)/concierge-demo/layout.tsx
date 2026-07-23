import type { ReactNode } from "react";
import "@/app/globals.css";

// Reuses the admin/Payload theme (see app/globals.css) rather than starting
// a third @theme — this is a throwaway test route for generative-ui-kit,
// not a real public-facing section.
export default function ConciergeDemoLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
