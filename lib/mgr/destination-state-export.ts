import type { StateTransaction } from "@/lib/commands/compliance";

/** Export the exact facts retained alongside the state totals. Numeric cells stay numeric. */
export function destinationStateCsv(periodStart: string, periodEnd: string, facts: StateTransaction[]): string {
  const records: (string | number)[][] = [["period_start", "period_end", "state", "kind", "event_date", "source_id", "original_source_id", "volume_bbl", "beer_sales_cents", "source_status"],
    ...facts.map(row => [periodStart, periodEnd, row.state, row.kind, row.eventDate, row.sourceId, row.originalSourceId ?? "", row.volumeBbl, row.salesCents, row.sourceStatus])];
  return records.map(row => row.map(value => {
    const text = typeof value === "string" && /^\s*[=+@-]/.test(value) ? `'${value}` : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
