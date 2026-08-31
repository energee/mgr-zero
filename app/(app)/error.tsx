// app/(app)/error.tsx — the single error surface for authenticated pages.
// Pages read through the command registry and let failures throw; this
// boundary renders them, so no page repeats its own "failed to load" branch.
"use client";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-red-600">Something went wrong: {error.message}</p>
      <button onClick={reset} className="w-fit underline">Try again</button>
    </div>
  );
}
