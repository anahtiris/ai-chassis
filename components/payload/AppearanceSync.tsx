"use client";

import * as React from "react";
import { FONT_SIZES, isFontScale } from "@/lib/appearance";

// Payload renders its OWN <html> (a separate document tree from the toolkit's
// app/(app) layout), so the font size chosen in /admin/settings has to be
// re-applied here for /admin/cms to match. Registered as a Payload admin
// `provider` (payload.config.ts admin.components.providers).
//
// Only font size needs this bridge: Payload's light/dark theme is handled
// natively from the mirrored `payload-theme` cookie (admin.theme: 'all' +
// Payload's getRequestTheme). Scaling Payload's root font-size overrides its
// own type sizing — intentional per the "apply to Payload too" choice, but
// it leans on Payload keeping rem-based sizing.
export function AppearanceSync({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const match = document.cookie.match(/(?:^|; )font-scale=([^;]+)/);
    const value = match?.[1];
    if (isFontScale(value)) {
      document.documentElement.style.fontSize = FONT_SIZES[value];
    }
  }, []);

  return <>{children}</>;
}
