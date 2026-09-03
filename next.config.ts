import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  // The customer guides in content/docs are rendered at /docs/<name>. The
  // pre-Fumadocs URLs redirect there: the master guide was renamed to index,
  // so /docs/user-guide{,.html} needs its own destination. Names are matched
  // explicitly — a permanent redirect is browser-cached, so an open :guide
  // would cache /docs/anything.html onto a 404.
  redirects: async () => [
    { source: "/docs/user-guide{.html}?", destination: "/docs", permanent: true },
    { source: "/docs/:guide(staff-guide|portal-guide).html", destination: "/docs/:guide", permanent: true },
  ],
};

export default createMDX()(nextConfig);
