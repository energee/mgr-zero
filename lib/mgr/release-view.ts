// lib/mgr/release-view.ts — view-model for the release form (portal releases,
// docs/plans/portal-release-windows.md and release-pool-and-ceilings.md). A
// form releases SKUs for portal ordering from one source: a planned batch (one
// pool in barrels that every ticked package draws from, shipping from the
// batch's ready date) or packaged stock (a unit quantity, shipping from today).
// It also says how one list_releases row reads, and builds the release_sku /
// update_release payloads.
import { formatDate } from "@/lib/date-format";
import { plural } from "./plural";
import { submitReason } from "./submit-reason";

/** One list_release_batches row: one SKU a planned batch can be released as, with the batch's planned barrels and its pool once it has one. */
export type ReleaseBatchRow = {
  batch_id: string; batch_no: number | null; sku_id: string; planned_bbl: number; wholesale_bbl: number | null; needed_by: string;
  skus: { name: string; brands: { name: string } | null } | null;
};

/** One list_releases row. qty is null when the package has no limit of its own; pool_bbl is set on a batch release with a pool. */
export type ReleaseRow = {
  id: string; batch_id: string | null; batch_no: number | null; sku_id: string; sku_name: string;
  qty: number | null; ships_from: string; orders_close_on: string | null; withdrawn_at: string | null;
  ready_on: string | null; open: boolean; cancelled: boolean; confirmed: number; preordered: number; remaining: number;
  pool_bbl?: number | null; pool_left_bbl?: number | null; planned_bbl?: number | null;
};

/** The brewery's release defaults (get_brewery): the percent of a batch opened to wholesale and the days before ship that ordering closes. */
export type ReleaseDefaults = { openPct: number; orderByDays: number };
const DEFAULTS: ReleaseDefaults = { openPct: 75, orderByDays: 7 };
export const releaseDefaultsOf = (brewery: { release_open_pct: number; release_order_by_days: number }): ReleaseDefaults =>
  ({ openPct: brewery.release_open_pct, orderByDays: brewery.release_order_by_days });

/** An ISO date moved by whole days. */
export const shiftDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Barrels as text: at most two decimals, none when whole. */
export const bbl = (value: number) => String(Math.round(value * 100) / 100);

/** A batch form's pool fields: the batch's pool when it has one, else the default percent of its planned barrels, and ordering closed the default days before ship. */
const poolFields = (row: ReleaseBatchRow, defaults: ReleaseDefaults) => ({
  wholesaleBbl: bbl(row.wholesale_bbl ?? row.planned_bbl * defaults.openPct / 100), plannedBbl: row.planned_bbl,
  ordersCloseOn: shiftDays(row.needed_by, -defaults.orderByDays),
});

/** A batch and SKU that already have an open release (`releases` are list_releases({ open: true })). */
const releasedKey = (batchId: string | null, skuId: string) => `${batchId}:${skuId}`;

/** An open release's row under its SKU (Brand page Sells as). */
export const releaseRowView = (row: ReleaseRow) => ({
  key: row.id, title: `Release · ${row.batch_no ? `Batch ${row.batch_no}` : "Packaged stock"}`, detail: releaseDetail(row),
});

/** A line of the form: one SKU, released when `include` is ticked. `qty` (typed text) is the units of a stock release; a batch line leaves it blank and draws on the pool. */
export type ReleaseLine = { skuId: string; name: string; qty: string; include: boolean };

/** The form's state. No batchId releases packaged stock. `source` names where it comes from.
 *  A batch form carries its pool: wholesaleBbl (typed text), out of the batch's plannedBbl. */
export type ReleaseForm = {
  key: string; batchId?: string; source: string; shipsFrom: string; ordersCloseOn: string; lines: ReleaseLine[];
  wholesaleBbl?: string; plannedBbl?: number;
};

const batchName = (row: ReleaseBatchRow) => `Batch ${row.batch_no ?? "—"}`;
const batchSource = (row: ReleaseBatchRow) => `${batchName(row)} · ready ${formatDate(row.needed_by)}`;
const skuName = (row: ReleaseBatchRow) => row.skus?.name ?? row.sku_id;

/** One form per planned batch, every package not yet released ticked, with the
 *  batch's pool; `released` once every one of them has an open release.
 *  title and detail are the batch's Planning row. */
export function batchReleaseForms(rows: ReleaseBatchRow[], releases: ReleaseRow[] = [], defaults: ReleaseDefaults = DEFAULTS): (ReleaseForm & { title: string; detail: string; released: boolean })[] {
  const released = new Set(releases.map((r) => releasedKey(r.batch_id, r.sku_id)));
  return [...Map.groupBy(rows, (row) => row.batch_id).values()].map((batch) => {
    const unreleased = batch.filter((row) => !released.has(releasedKey(row.batch_id, row.sku_id)));
    return {
    key: batch[0].batch_id,
    batchId: batch[0].batch_id,
    title: `${batchName(batch[0])} · ${batch[0].skus?.brands?.name ?? "No brand"}`,
    detail: [`ready ${formatDate(batch[0].needed_by)}`, `${bbl(batch[0].planned_bbl)} bbl`, plural(batch.length, "package"),
      unreleased.length && unreleased.length < batch.length ? `${batch.length - unreleased.length} released` : undefined].filter(Boolean).join(" · "),
    source: batchSource(batch[0]),
    shipsFrom: batch[0].needed_by,
    ...poolFields(batch[0], defaults),
    released: unreleased.length === 0,
    lines: unreleased.map((row) => ({ skuId: row.sku_id, name: skuName(row), qty: "", include: true })),
    };
  });
}

/** The forms one SKU can release from: packaged stock (ships today, quantity
 *  typed) and each planned batch of its brand that has no open release of it
 *  yet (with the batch's pool). */
export function skuReleaseForms(sku: { id: string; name: string }, rows: ReleaseBatchRow[], today: string, releases: ReleaseRow[] = [], defaults: ReleaseDefaults = DEFAULTS): ReleaseForm[] {
  const released = new Set(releases.map((r) => releasedKey(r.batch_id, r.sku_id)));
  return [
    { key: "stock", source: "Packaged stock", shipsFrom: today, ordersCloseOn: "", lines: [{ skuId: sku.id, name: sku.name, qty: "", include: true }] },
    ...rows.filter((row) => row.sku_id === sku.id && !released.has(releasedKey(row.batch_id, sku.id))).map((row) => ({
      key: row.batch_id, batchId: row.batch_id, source: batchSource(row), shipsFrom: row.needed_by, ...poolFields(row, defaults),
      lines: [{ skuId: sku.id, name: sku.name, qty: "", include: true }],
    })),
  ];
}

const wholeUnits = (qty: string) => /^\d+$/.test(qty.trim()) && Number(qty) > 0;
const WHOLE = "a whole quantity above zero";

/** What is wrong with typed pool barrels, or nothing: above zero, at most two decimals, within the planned batch. */
function poolProblems(wholesaleBbl: string, plannedBbl: number | null | undefined): string[] {
  const value = Number(wholesaleBbl);
  if (!/^\d+(\.\d{1,2})?$/.test(wholesaleBbl.trim()) || !(value > 0)) return ["barrels open to wholesale above zero"];
  return plannedBbl != null && value > plannedBbl ? [`no more than the ${bbl(plannedBbl)} bbl planned`] : [];
}

/** release_sku for the ticked lines. A batch form sends its pool and no
 *  quantities; a stock form sends each line's quantity. `reason` withholds
 *  Release until at least one line is ticked and the pool, or every quantity, is valid. */
export function releaseCommand(form: ReleaseForm) {
  const ticked = form.lines.filter((line) => line.include);
  const batch = form.batchId !== undefined;
  return {
    name: "release_sku" as const,
    input: {
      ...(batch ? { batchId: form.batchId, wholesaleBbl: Number(form.wholesaleBbl) } : {}),
      shipsFrom: form.shipsFrom,
      ...(form.ordersCloseOn ? { ordersCloseOn: form.ordersCloseOn } : {}),
      lines: ticked.map((line) => (batch ? { skuId: line.skuId } : { skuId: line.skuId, qty: Number(line.qty) })),
    },
    reason: submitReason([
      ...(ticked.length === 0 ? ["at least one SKU"] : []),
      ...(batch ? poolProblems(form.wholesaleBbl ?? "", form.plannedBbl) : []),
      ...(!batch && ticked.some((line) => !wholeUnits(line.qty)) ? [WHOLE] : []),
      ...(form.shipsFrom ? [] : ["a ships-from date"]),
    ]),
  };
}

/** update_release for a new quantity and order-by date (blank clears it). On a
 *  release with a pool the quantity is the package's own limit and may be blank
 *  (none), and `wholesaleBbl` changes the batch's pool when it differs. */
export function updateReleaseCommand(row: ReleaseRow, qty: string, ordersCloseOn: string, wholesaleBbl?: string) {
  const pooled = row.pool_bbl != null;
  const noLimit = pooled && qty.trim() === "";
  const poolChanged = pooled && wholesaleBbl !== undefined && Number(wholesaleBbl) !== row.pool_bbl;
  return {
    name: "update_release" as const,
    input: { releaseId: row.id, qty: noLimit ? null : Number(qty), ordersCloseOn: ordersCloseOn || null, ...(poolChanged ? { wholesaleBbl: Number(wholesaleBbl) } : {}) },
    reason: submitReason([...(noLimit || wholeUnits(qty) ? [] : [WHOLE]), ...(poolChanged ? poolProblems(wholesaleBbl, row.planned_bbl) : [])]),
  };
}

/** An open release's row: "12 of 40 left · 20 confirmed · 8 pre-ordered ·
 *  ships Dec 4, 2026 · order by Nov 27, 2026". With a pool it leads with the
 *  batch: "4 of 6 bbl left in the batch · 8 more of this package". */
export function releaseDetail(row: ReleaseRow): string {
  return [
    ...(row.pool_bbl != null
      ? [`${bbl(Math.max(row.pool_left_bbl ?? 0, 0))} of ${bbl(row.pool_bbl)} bbl left in the batch`, `${row.remaining} more of this package${row.qty != null ? ` (limit ${row.qty})` : ""}`]
      : [`${row.remaining} of ${row.qty} left`]),
    row.confirmed ? `${row.confirmed} confirmed` : undefined,
    row.preordered ? `${row.preordered} pre-ordered` : undefined,
    `ships ${formatDate(row.ships_from)}`,
    row.orders_close_on ? `order by ${formatDate(row.orders_close_on)}` : undefined,
  ].filter(Boolean).join(" · ");
}
