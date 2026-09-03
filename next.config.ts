import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The customer guides in public/docs are body fragments rendered at
  // /docs/<name> (app/(docs)/docs/[guide]). Redirects run before public files
  // are served, so the raw, unstyled fragment is never what a visitor sees.
  redirects: async () => [{ source: "/docs/:guide.html", destination: "/docs/:guide", permanent: true }],
};

export default nextConfig;
