"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import {
  APPEARANCE_COOKIE_PATH,
  COOKIE_MAX_AGE,
  FONT_COOKIE,
  FONT_SIZES,
  PAYLOAD_THEME_COOKIE,
  THEME_COOKIE,
  type FontScale,
  type ThemeChoice,
} from "@/lib/appearance";

// The single place a user picks light/dark/system + font size. Writes plain
// cookies scoped to /admin (read server-side by the (app) root layout and by
// Payload — see APPEARANCE_COOKIE_PATH) AND applies the change to the live
// <html> immediately, so the current page updates without a reload;
// Payload's /admin/cms picks it up on its next load via the same cookies.
// The /admin scope is deliberate: this is a personal admin-portal
// preference, not a site-wide one — public (site) pages must never inherit
// it (see docs/decisions.md "Admin appearance cookies scoped to /admin").

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=${APPEARANCE_COOKIE_PATH}; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=${APPEARANCE_COOKIE_PATH}; max-age=0; SameSite=Lax`;
}

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

const THEME_OPTIONS: ThemeChoice[] = ["system", "light", "dark"];
const FONT_OPTIONS: FontScale[] = ["sm", "md", "lg"];

export function AppearanceControls({
  initialTheme,
  initialFont,
}: {
  initialTheme: "light" | "dark" | null;
  initialFont: FontScale;
}) {
  const [theme, setTheme] = React.useState<ThemeChoice>(
    initialTheme ?? "system",
  );
  const [font, setFont] = React.useState<FontScale>(initialFont);

  function chooseTheme(choice: ThemeChoice) {
    setTheme(choice);
    if (choice === "system") {
      // No explicit choice: clear both cookies so the (app) layout and
      // Payload each fall back to the OS preference.
      deleteCookie(THEME_COOKIE);
      deleteCookie(PAYLOAD_THEME_COOKIE);
    } else {
      setCookie(THEME_COOKIE, choice);
      setCookie(PAYLOAD_THEME_COOKIE, choice); // mirror into Payload
    }
    const dark = choice === "dark" || (choice === "system" && prefersDark());
    document.documentElement.classList.toggle("dark", dark);
  }

  function chooseFont(scale: FontScale) {
    setFont(scale);
    setCookie(FONT_COOKIE, scale);
    document.documentElement.style.setProperty("font-size", FONT_SIZES[scale]);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {t("settings.appearance.theme")}
        </span>
        <div className="flex flex-wrap gap-2">
          {THEME_OPTIONS.map((opt) => (
            <Button
              key={opt}
              type="button"
              size="sm"
              variant={theme === opt ? "default" : "outline"}
              onClick={() => chooseTheme(opt)}
            >
              {t(`settings.appearance.themeOptions.${opt}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {t("settings.appearance.fontSize")}
        </span>
        <div className="flex flex-wrap gap-2">
          {FONT_OPTIONS.map((opt) => (
            <Button
              key={opt}
              type="button"
              size="sm"
              variant={font === opt ? "default" : "outline"}
              onClick={() => chooseFont(opt)}
            >
              {t(`settings.appearance.fontOptions.${opt}`)}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {t("settings.appearance.note")}
      </p>
    </div>
  );
}
