// app/(app)/error.tsx — the single error surface for authenticated pages.
// Pages read through the command registry and let failures throw; this
// boundary renders them, so no page repeats its own "failed to load" branch.
// The message is generic: Next.js already strips server error text in
// production, and the real error is logged server-side (registry.ts rpcError).
// A missing record is not an error — it renders not-found.tsx instead.
// "Try again" calls retry, which re-runs the server render; reset would only
// re-render the children the server already sent, and they throw again.
"use client";

export default function AppError({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p role="alert" className="text-destructive">Something went wrong loading this page.</p>
      <button onClick={() => retry()} className="w-fit underline">Try again</button>
    </div>
  );
}
