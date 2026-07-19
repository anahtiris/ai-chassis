/**
 * Minimal translation helper — one text-extraction pattern for the whole app.
 *
 * Resolves `namespace.key.path` strings against JSON catalogs under
 * `messages/en/*.json`. `getTranslator(namespace)` returns a lookup
 * function bound to that namespace's catalog; pre-bound exports (`t`,
 * `tCommon`) save call sites from re-binding it themselves. Not named
 * `useTranslations` despite the similarity to next-intl's hook — this is a
 * plain factory (calls no hooks, safe at module scope), and the `use`
 * prefix trips ESLint's react-hooks/rules-of-hooks naming heuristic.
 *
 * This is deliberately not a full i18n library (no locale switching, no
 * pluralization, no ICU message format) — just a convention for keeping
 * copy out of JSX so a project can grow into real i18n later without a
 * rewrite of every call site. Add more namespace catalogs as a project
 * needs them; `CATALOGS` is the only place that has to know about them.
 *
 * Missing keys fall back to a humanized form of the last path segment
 * (e.g. `buttons.signOut` -> "Sign out") so a gap in the catalog never
 * renders a raw key or throws.
 */
import adminMessages from "@/messages/en/admin.json";
import commonMessages from "@/messages/en/common.json";

type Catalog = { [k: string]: string | Catalog };

const CATALOGS: Record<string, Catalog> = {
  admin: adminMessages as Catalog,
  common: commonMessages as Catalog,
};

function humanize(key: string): string {
  const last = key.split(".").pop() ?? key;
  return last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export function getTranslator(namespace: string): (key: string) => string {
  const catalog = CATALOGS[namespace];
  return (key: string): string => {
    let node: string | Catalog | undefined = catalog;
    for (const part of key.split(".")) {
      if (node == null || typeof node === "string") {
        node = undefined;
        break;
      }
      node = node[part];
    }
    return typeof node === "string" ? node : humanize(key);
  };
}

/** Pre-bound to the `admin` namespace — nav labels, hub cards, admin buttons. */
export const t = getTranslator("admin");

/** Pre-bound to the `common` namespace — generic strings shared across areas. */
export const tCommon = getTranslator("common");
