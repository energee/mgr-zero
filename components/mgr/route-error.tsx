// components/mgr/route-error.tsx — the one body every error.tsx renders.
// Pages read through the command registry and let failures throw; the
// boundary shows this generic line. Next.js already strips server error text in
// production, and the real error is logged server-side (registry.ts rpcError),
// so raw database text never reaches staff or a customer.
// "Try again" calls retry, which re-runs the server render; reset would only
// re-render the children the server already sent, and they throw again (#445).
"use client";

export function RouteError({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p role="alert" className="text-destructive">Something went wrong loading this page.</p>
      <button onClick={() => retry()} className="w-fit underline">Try again</button>
    </div>
  );
}
