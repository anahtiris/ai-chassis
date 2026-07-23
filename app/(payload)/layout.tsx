import type { ServerFunctionClient } from "payload";
import config from "@payload-config";
import "@payloadcms/next/css";
// Deliberately NOT importing app/globals.css here. It bundles Tailwind's
// preflight + a base element layer (`*`, `body`, `h1-h6` in globals.css),
// which reset margins/box-sizing/type on Payload's OWN chrome and break its
// layout — Payload's admin UI (@payloadcms/next/css above) relies on default
// UA styles that preflight strips. No custom Payload component currently uses
// Tailwind utilities or brand tokens (BackToHubButton uses Payload's own
// `nav__log-out` class), so there is nothing here to theme. If a future
// custom Payload field DOES need brand tokens, give it a scoped, preflight-
// free stylesheet then rather than re-importing globals.css. See
// docs/decisions.md "Separate Tailwind themes per section".
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import React from "react";
import { importMap } from "./admin/cms/importMap";

type Args = {
  children: React.ReactNode;
};

const serverFunction: ServerFunctionClient = async function (args) {
  "use server";
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  });
};

const Layout = ({ children }: Args) => (
  <RootLayout
    config={config}
    importMap={importMap}
    serverFunction={serverFunction}
  >
    {children}
  </RootLayout>
);

export default Layout;
