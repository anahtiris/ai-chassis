import path from "node:path";
import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // swagger-ui-dist's absolute-path.js resolves its own __dirname to locate
  // its static assets at request time (see app/api/vendor/swagger-ui) —
  // bundling it rewrites that __dirname to a build-internal path that
  // doesn't exist on disk. Keep it as a real require() so __dirname stays
  // accurate.
  serverExternalPackages: ["swagger-ui-dist"],
  // generative-ui-kit (package.json) is an absolute local-path dependency
  // pointing at a sibling repo, not a monorepo package — Turbopack's
  // workspace root otherwise auto-detects to this repo's own lockfile and
  // refuses to resolve anything outside it ("leaves the filesystem root").
  // Widen it to the common parent so that package's JS and its Tailwind
  // @source scan (app/globals.css) both resolve.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default withPayload(nextConfig);
