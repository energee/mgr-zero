// components/mgr/route-error.tsx — the one body every error.tsx renders.
// Pages read through the command registry and let failures throw; the
// boundary shows this generic line. Next.js already strips server error text in
// production, so raw database text never reaches staff or a customer. A server
// error carries a digest, shown as a reference; instrumentation.ts logs the
// same digest with its route, so a report can be matched to the log (#1299).
// "Try again" calls retry, which re-runs the server render; reset would only
// re-render the children the server already sent, and they throw again (#445).
// A server error retries itself once first: the one seen on live was a cold
// first request that loaded on reload (#1299).
"use client";

import { useEffect } from "react";
import { RouteErrorView } from "@/components/mgr/views/route-error";

const AUTO_RETRY_GAP_MS = 30_000;
let lastAutoRetry = -Infinity;

/** Whether this error may retry itself now; at most once per 30 s, so a
 *  failure that persists shows the card instead of retrying in a loop. */
export function claimAutoRetry(now: number): boolean {
  if (now - lastAutoRetry < AUTO_RETRY_GAP_MS) return false;
  lastAutoRetry = now;
  return true;
}

export function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;
  // Only a server error (it has a digest) can pass on a fresh render.
  useEffect(() => { if (digest && claimAutoRetry(Date.now())) retry(); }, [digest, retry]);
  return <RouteErrorView reference={digest} onRetry={retry} />;
}
