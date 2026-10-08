// app/error.tsx — the error surface for pages with no closer boundary: the
// (auth) group (login, reset, accept, password, invitations, create-brewery),
// which has no shell, and a failure in the (app) or (portal) layout itself,
// which its own error.tsx does not wrap. (docs) and (frames) fall back here
// too. It renders on the entry card the auth
// pages use. A root layout failure would need app/global-error.tsx.
"use client";

import { EntrySurface } from "@/components/mgr/entry-surface";
import { RouteError } from "@/components/mgr/route-error";

export default function RootError({ retry }: { retry: () => void }) {
  return <EntrySurface><RouteError retry={retry} /></EntrySurface>;
}
