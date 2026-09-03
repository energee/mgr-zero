import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  // The customer guides in content/docs are rendered at /docs/<name>; the
  // pre-Fumadocs public/docs/<name>.html URLs redirect there.
  redirects: async () => [
    { source: "/docs/user-guide.html", destination: "/docs", permanent: true },
    { source: "/docs/user-guide", destination: "/docs", permanent: true },
    { source: "/docs/:guide.html", destination: "/docs/:guide", permanent: true },
  ],
};

export default createMDX()(nextConfig);
