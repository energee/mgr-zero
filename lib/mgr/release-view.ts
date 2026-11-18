// lib/mgr/release-view.ts — view-model for the release form (portal releases,
// docs/plans/portal-release-windows.md). A form releases SKUs for portal
// ordering from one source: a planned batch (prefilled from
// list_release_batches' projected units, shipping from the batch's ready
// date) or packaged stock (shipping from today). It also says how one
// list_releases row reads, and builds the release_sku / update_release payloads.
import { formatDate } from "@/lib/date-format";
import { plural } from "./plural";
import { submitReason } from "./submit-reason";

/** One list_release_batches row: a planned batch's projected units of one SKU. */
export type ReleaseBatchRow = {
  batch_id: string; batch_no: number | null; sku_id: string; units: number; needed_by: string;
  skus: { name: string; brands: { name: string } | null } | null;
};

/** One list_releases row. */
export type ReleaseRow = {
  id: string; batch_id: string | null; batch_no: number | null; sku_id: string; sku_name: string;
  qty: number; ships_from: string; orders_close_on: string | null; withdrawn_at: string | null;
  ready_on: string | null; open: boolean; confirmed: number; preordered: number; remaining: number;
};

/** A line of the form: release `qty` (typed text) of one SKU when `include` is ticked. */
export type ReleaseLine = { skuId: string; name: string; qty: string; include: boolean };

/** The form's state. No batchId releases packaged stock. `source` names where it comes from. */
export type ReleaseForm = {
  key: string; batchId?: string; source: string; shipsFrom: string; ordersCloseOn: string; lines: ReleaseLine[];
};

const batchName = (row: ReleaseBatchRow) => `Batch ${row.batch_no ?? "—"}`;
const batchSource = (row: ReleaseBatchRow) => `${batchName(row)} · ready ${formatDate(row.needed_by)}`;
const skuName = (row: ReleaseBatchRow) => row.skus?.name ?? row.sku_id;

/** One form per planned batch, every projected SKU ticked at its projected units.
 *  title and detail are the batch's Planning row. */
export function batchReleaseForms(rows: ReleaseBatchRow[]): (ReleaseForm & { title: string; detail: string })[] {
  return [...Map.groupBy(rows, (row) => row.batch_id).values()].map((batch) => ({
    key: batch[0].batch_id,
    batchId: batch[0].batch_id,
    title: `${batchName(batch[0])} · ${batch[0].skus?.brands?.name ?? "No brand"}`,
    detail: `ready ${formatDate(batch[0].needed_by)} · ${plural(batch.length, "package")}`,
    source: batchSource(batch[0]),
    shipsFrom: batch[0].needed_by,
    ordersCloseOn: "",
    lines: batch.map((row) => ({ skuId: row.sku_id, name: skuName(row), qty: String(row.units), include: true })),
  }));
}

/** The forms one SKU can release from: packaged stock (ships today, quantity
 *  typed) and each planned batch projecting it (prefilled). */
export function skuReleaseForms(sku: { id: string; name: string }, rows: ReleaseBatchRow[], today: string): ReleaseForm[] {
  return [
    { key: "stock", source: "Packaged stock", shipsFrom: today, ordersCloseOn: "", lines: [{ skuId: sku.id, name: sku.name, qty: "", include: true }] },
    ...rows.filter((row) => row.sku_id === sku.id).map((row) => ({
      key: row.batch_id, batchId: row.batch_id, source: batchSource(row), shipsFrom: row.needed_by, ordersCloseOn: "",
      lines: [{ skuId: sku.id, name: sku.name, qty: String(row.units), include: true }],
    })),
  ];
}

const wholeUnits = (qty: string) => /^\d+$/.test(qty.trim()) && Number(qty) > 0;
const WHOLE = "a whole quantity above zero";

/** release_sku for the ticked lines; `reason` withholds Release until every
 *  ticked line has a whole quantity and at least one is ticked. */
export function releaseCommand(form: ReleaseForm) {
  const ticked = form.lines.filter((line) => line.include);
  return {
    name: "release_sku" as const,
    input: {
      ...(form.batchId ? { batchId: form.batchId } : {}),
      shipsFrom: form.shipsFrom,
      ...(form.ordersCloseOn ? { ordersCloseOn: form.ordersCloseOn } : {}),
      lines: ticked.map((line) => ({ skuId: line.skuId, qty: Number(line.qty) })),
    },
    reason: submitReason([
      ...(ticked.length === 0 ? ["at least one SKU"] : []),
      ...(ticked.some((line) => !wholeUnits(line.qty)) ? [WHOLE] : []),
      ...(form.shipsFrom ? [] : ["a ships-from date"]),
    ]),
  };
}

/** update_release for a new quantity and order-by date (blank clears it). */
export function updateReleaseCommand(row: ReleaseRow, qty: string, ordersCloseOn: string) {
  return {
    name: "update_release" as const,
    input: { releaseId: row.id, qty: Number(qty), ordersCloseOn: ordersCloseOn || null },
    reason: submitReason(wholeUnits(qty) ? [] : [WHOLE]),
  };
}

/** "12 of 40 left · 20 confirmed · 8 pre-ordered · ships Dec 4, 2026 · order by
 *  Nov 27, 2026", led by "withdrawn" or "closed" once buyers can no longer order. */
export function releaseDetail(row: ReleaseRow): string {
  return [
    row.withdrawn_at ? "withdrawn" : row.open ? undefined : "closed",
    `${row.remaining} of ${row.qty} left`,
    row.confirmed ? `${row.confirmed} confirmed` : undefined,
    row.preordered ? `${row.preordered} pre-ordered` : undefined,
    `ships ${formatDate(row.ships_from)}`,
    row.orders_close_on ? `order by ${formatDate(row.orders_close_on)}` : undefined,
  ].filter(Boolean).join(" · ");
}
