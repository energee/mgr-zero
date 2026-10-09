import type { StateTotal, StateTransaction } from "@/lib/commands/compliance";

/** Export the exact facts retained alongside the state totals. Numeric cells stay numeric. */
export function destinationStateCsv(periodStart: string, periodEnd: string, facts: StateTransaction[]): string {
  const records: (string | number)[][] = [["period_start", "period_end", "state", "kind", "event_date", "source_id", "original_source_id", "volume_bbl", "beer_sales_cents", "source_status"],
    ...facts.map(row => [periodStart, periodEnd, row.state, row.kind, row.eventDate, row.sourceId, row.originalSourceId ?? "", row.volumeBbl, row.salesCents, row.sourceStatus])];
  return records.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** One quoted CSV cell. A text cell starting with = + @ or - gets a leading quote so a
 *  spreadsheet shows it as text instead of running it as a formula. */
export function csvCell(value: string | number): string {
  const text = typeof value === "string" && /^\s*[=+@-]/.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * Per-state totals summed from the facts, sorted by state. Returns and
 * adjustments are split out of outward volume; credit memos out of invoiced cents.
 */
export function destinationStateTotals(facts: StateTransaction[]): StateTotal[] {
  const byState = new Map<string, StateTotal>();
  for (const fact of facts) {
    const total = byState.get(fact.state) ?? { state: fact.state, volumeBbl: 0, outwardBbl: 0, returnedBbl: 0, adjustmentBbl: 0, invoicedCents: 0, creditedCents: 0, salesCents: 0 };
    total.volumeBbl += fact.volumeBbl;
    total.salesCents += fact.salesCents;
    if (fact.kind === "return_in") total.returnedBbl -= fact.volumeBbl;
    else if (fact.kind === "adjustment") total.adjustmentBbl += fact.volumeBbl;
    else total.outwardBbl += fact.volumeBbl;
    if (fact.kind === "invoice") total.invoicedCents += fact.salesCents;
    if (fact.kind === "credit_memo") total.creditedCents -= fact.salesCents;
    byState.set(fact.state, total);
  }
  return [...byState.values()].sort((a, b) => a.state.localeCompare(b.state));
}
