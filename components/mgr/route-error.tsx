// components/mgr/route-error.tsx — the one body every error.tsx renders.
// Pages read through the command registry and let failures throw; the
// boundary shows this generic line. Next.js already strips server error text in
// production, so raw database text never reaches staff or a customer. A server
// error carries a digest, shown as a reference; instrumentation.ts logs the
// same digest with its route, so a report can be matched to the log (#1299).
// "Try again" calls retry, which re-runs the server render; reset would only
// re-render the children the server already sent, and they throw again (#445).
"use client";

import { RouteErrorView } from "@/components/mgr/views/route-error";

export function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;
  return <RouteErrorView reference={digest} onRetry={retry} />;
}
