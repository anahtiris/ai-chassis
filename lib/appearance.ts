// Shared appearance (theme + font-size) constants and pure helpers.
//
// Deliberately importing NO server-only modules (`next/headers` etc.) so
// this file is safe to import from client components (AppearanceControls,
// the Payload AppearanceSync provider) AND server ones (the (app) root
// layout, the settings page) alike. The server files read the actual cookie
// store themselves and hand a plain getter to `parseAppearance`.

export type ThemeChoice = "system" | "light" | "dark";
export type FontScale = "sm" | "md" | "lg";

// This toolkit's own theme cookie (drives the `.dark` class on the (app)
// <html>). PAYLOAD_THEME_COOKIE is Payload's own cookie name — mirroring the
// choice into it makes /admin/cms follow the same light/dark selection (see
// Payload's getRequestTheme, which reads `${cookiePrefix||'payload'}-theme`).
export const THEME_COOKIE = "theme";
export const PAYLOAD_THEME_COOKIE = "payload-theme";
export const FONT_COOKIE = "font-scale";

// Root font-size per preset. Tailwind's rem-based utilities scale off the
// <html> font-size, so setting it here resizes the whole UI proportionally.
export const FONT_SIZES: Record<FontScale, string> = {
  sm: "14px",
  md: "16px",
  lg: "18px",
};

export const DEFAULT_FONT: FontScale = "md";

// 1 year — a personal display preference, not session state.
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isExplicitTheme(v: unknown): v is "light" | "dark" {
  return v === "light" || v === "dark";
}

export function isFontScale(v: unknown): v is FontScale {
  return v === "sm" || v === "md" || v === "lg";
}

// Pure: takes a cookie getter (so the caller owns the `next/headers`
// dependency) and returns the resolved appearance. `theme: null` means "no
// explicit choice" — follow the OS (handled client-side, since the server
// can't read the OS preference).
export function parseAppearance(get: (name: string) => string | undefined): {
  theme: "light" | "dark" | null;
  font: FontScale;
} {
  const themeRaw = get(THEME_COOKIE);
  const fontRaw = get(FONT_COOKIE);
  return {
    theme: isExplicitTheme(themeRaw) ? themeRaw : null,
    font: isFontScale(fontRaw) ? fontRaw : DEFAULT_FONT,
  };
}
