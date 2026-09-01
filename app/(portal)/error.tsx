// app/(portal)/error.tsx — the single error surface for portal pages.
// Mirrors app/(app)/error.tsx: pages read through the command registry and
// let failures throw; this boundary renders them.
"use client";

export default function PortalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-red-600">Something went wrong: {error.message}</p>
      <button onClick={reset} className="w-fit underline">Try again</button>
    </div>
  );
}
