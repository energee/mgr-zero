// app/(portal)/error.tsx — the single error surface for portal pages.
// Mirrors app/(app)/error.tsx: pages read through the command registry and
// let failures throw; this boundary renders them. Like the staff boundary it
// shows a generic line: raw database text never reaches a customer.
"use client";

export default function PortalError({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p role="alert" className="text-destructive">Something went wrong loading this page.</p>
      <button onClick={() => retry()} className="w-fit underline">Try again</button>
    </div>
  );
}
