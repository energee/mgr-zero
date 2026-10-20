// components/mgr/views/price-summary.tsx — one unboxed money summary for a
// document page: labeled rows, then an optional prominent total and the
// sentence saying what the total is (and is not), then optional settlement
// rows (an invoice's balance and cash). The Order and Invoice details draw it
// beside their facts; the caller's adapter does the arithmetic and wording.
export type PriceSummaryModel = {
  /** Subtotals and charges, already formatted ("$1,028.00", or a status such as "Not finalized until submission"). */
  rows: { label: string; value: string }[];
  /** The one grand figure; absent when the facts cannot support one. */
  total?: { label: string; value: string };
  /** What the figure means: basis, exclusions, or why there is no total. */
  note: string;
  /** After the total: what is still owed and what was paid ("Outstanding balance", "Cash received"); `strong` is the one to read first. */
  settlement?: { label: string; value: string; strong?: boolean }[];
};

export function PriceSummary({ model, id = "price-summary" }: { model: PriceSummaryModel; id?: string }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col">
      <h2 id={id} className="text-base font-semibold">Price summary <span className="text-xs font-medium text-muted-foreground">· USD</span></h2>
      {model.rows.length ? (
        <dl className="mt-2 flex flex-col gap-2.5 text-sm">
          {model.rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <dt className="min-w-0">{row.label}</dt>
              <dd className="shrink-0 text-right tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className={model.rows.length ? "mt-3 border-t pt-3" : "mt-2"}>
        {model.total ? (
          <>
            <p className="text-sm font-semibold">{model.total.label}</p>
            <p className="mt-1 mb-2 text-3xl font-bold tracking-tight tabular-nums">{model.total.value}</p>
          </>
        ) : null}
        <p className="text-xs text-pretty text-muted-foreground">{model.note}</p>
      </div>
      {model.settlement?.length ? (
        <dl className="mt-3 flex flex-col gap-2.5 border-t pt-3 text-sm">
          {model.settlement.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4">
              <dt className={row.strong ? "min-w-0 font-medium" : "min-w-0"}>{row.label}</dt>
              <dd className={row.strong ? "shrink-0 text-right text-xl font-bold tabular-nums" : "shrink-0 text-right tabular-nums"}>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
