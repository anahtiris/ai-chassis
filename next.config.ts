import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // swagger-ui-dist's absolute-path.js resolves its own __dirname to locate
  // its static assets at request time (see app/api/vendor/swagger-ui) —
  // bundling it rewrites that __dirname to a build-internal path that
  // doesn't exist on disk. Keep it as a real require() so __dirname stays
  // accurate.
  serverExternalPackages: ["swagger-ui-dist"],
};

export default withPayload(nextConfig);
