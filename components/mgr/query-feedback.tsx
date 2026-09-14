import { Button } from "@/components/ui/button";

/** Inline request feedback, never replacement skeleton rows. */
export function QueryFeedback({ error, loading, retry }: { error?: Error | null; loading?: string; retry: () => void }) {
  if (error) return <div role="alert" className="text-sm text-destructive">{error.message} <Button variant="ghost" onClick={retry}>Try again</Button></div>;
  return loading ? <p role="status" className="text-sm text-muted-foreground">{loading}…</p> : null;
}
