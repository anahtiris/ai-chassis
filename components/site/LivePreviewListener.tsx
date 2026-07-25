"use client";

import { RefreshRouteOnSave } from "@payloadcms/live-preview-react";
import { useRouter } from "next/navigation";

// Rendered only when Next.js Draft Mode is active (see PageView.tsx and
// blog/[slug]/page.tsx) — listens for postMessage updates from the
// /admin/cms editor iframe and refreshes the route on every save, so the
// live-preview pane updates without a manual reload. serverURL is the
// current origin: admin and site are the same app/host here, unlike
// payload-poc's separate frontend/admin deployments.
export function LivePreviewListener() {
  const router = useRouter();
  return (
    <RefreshRouteOnSave
      refresh={() => router.refresh()}
      serverURL={typeof window !== "undefined" ? window.location.origin : ""}
    />
  );
}
