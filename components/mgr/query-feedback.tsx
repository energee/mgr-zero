import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/date-format";

/** Inline request feedback, never replacement skeleton rows. */
export function QueryFeedback({ timeZone, error, loading, retry, fetching, paused, updatedAt, showCheckedAt = true }: {
  timeZone: string; error?: Error | null; loading?: string; retry?: () => void;
  fetching?: boolean; paused?: boolean; updatedAt?: number; showCheckedAt?: boolean;
}) {
  const checkedAt = updatedAt ? new Date(updatedAt) : null;
  const checked = showCheckedAt && checkedAt && <>Last checked <time dateTime={checkedAt.toISOString()}>{formatDateTime(checkedAt, timeZone)}</time>.</>;
  if (error) return <div role="alert" className="text-sm text-destructive">
    {error.message} {checkedAt && "Showing last-known data. "}
    <Button type="button" variant="ghost" onClick={retry}>Try again</Button> {checked}
  </div>;
  if (paused) return <p role="status" className="text-sm text-muted-foreground">Waiting for connection. {checkedAt && "Showing last-known data. "}{checked}</p>;
  if (loading) return <p role="status" className="text-sm text-muted-foreground">{loading}…</p>;
  // Successful polling must not announce a changing timestamp every five seconds.
  return checkedAt && (showCheckedAt || fetching) ? <p className="min-h-5 text-xs text-muted-foreground">{fetching && "Updating… "}{checked}</p> : null;
}
