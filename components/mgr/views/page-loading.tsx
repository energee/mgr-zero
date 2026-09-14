/** Shared staff route fallback, also drawn in the screen inventory. */
export function PageLoadingView() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-4">
      <p className="text-sm text-muted-foreground">Loading page…</p>
      <div aria-hidden="true" className="divide-y motion-safe:animate-pulse">
        {[0, 1, 2].map(row => (
          <div key={row} className="space-y-3 py-5">
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="h-3 w-3/4 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
