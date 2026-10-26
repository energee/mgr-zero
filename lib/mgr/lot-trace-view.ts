// lib/mgr/lot-trace-view.ts — view-model for Lot trace.
import { formatDate } from "@/lib/date-format";
import { sentenceCase } from "./labels";
import { shipToAddress } from "./ship-to-view";
import { bblFixed } from "@/lib/volume";
import { batNo } from "./doc-no";

export type LotTraceRowView = { key: string; title: string; detail?: string; trailing?: string };
export type LotTraceTapeView = { key: string; label: string; when?: string };
export type LotTraceRecipientView = {
  id: string;
  orderNo: number;
  orderHref?: string;
  customer?: { id: string; name: string; href?: string };
  shipTo?: string;
  shipments: { id: string; label: string; invoices: { id: string; number: number; href?: string }[] }[];
};
export type LotTraceMovementView = {
  id: string;
  title: string;
  detail: string;
  trailing: string;
  sourceHref?: string;
  reference?: string;
  referenceHref?: string;
};

export type LotTraceSources = {
  batches: { id: string; batch_no: number | null; brewed_on: string | null }[];
  transfers: { id: string; from_occupancy_id: string; to_occupancy_id: string; from_batch_id: string; to_batch_id: string; from_vessel: string; to_vessel: string; bbl: number; at: string }[];
};

export type LotTraceViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  sku: string;
  skuDetail: string;
  skuTrailing: string;
  tankBatch: string;
  drawn: string;
  memberBatches: LotTraceRowView[];
  sourceTransfers: LotTraceRowView[];
  ingredients: (LotTraceRowView & { href?: string; tracked: boolean })[];
  tape: LotTraceTapeView[];
  balances: LotTraceRowView[];
  recipientsEmpty?: string;
  recipients?: LotTraceRecipientView[];
  movements?: LotTraceMovementView[];
  note: string;
};

export type LotTraceSnapshot = LotTraceSources & {
  lot: { code: string; brand: string; packaged_on: string; best_by: string | null };
  run: { run_no: number | null; bbl_drawn: number | null; vessel: string } | null;
  // The receiving packaging batch; `batches` includes every recorded lineage member.
  batch: { batch_no: number | null; brewed_on: string | null } | null;
  ingredients: { material_id: string; material: string; lot_id: string | null; code: string | null; unit: string; source: string; qty: number }[];
  movements: { id: string; type: string; qty: number; bbl: number; bin: string; ref: string | null; ref_label?: string | null; ref_kind?: string | null; source_movement_id: string | null; created_at: string; sku: string; location: string }[];
  on_hand_bbl: number;
  warning: string;
  balances: { sku_id: string; bin_id: string; sku: string; bin: string; location: string; qty: number; bbl: number }[];
  recipients: { id: string; order_no: number; customers: { id: string; name: string } | null; ship_tos: { label: string; country: string; address1: string | null; address2?: string | null; city: string | null; state: string | null; zip: string | null } | null; shipments: { id: string; carrier: string | null; tracking: string | null; invoices: { id: string; invoice_no: number }[] }[] }[];
};

const ownedSku = (brand: string, sku: string) =>
  sku.startsWith(`${brand} ·`) ? sku : [brand, sku].filter(Boolean).join(" · ");

/** Both recall directions display the same authorized orders, addresses, shipments and invoices. */
export function toRecipientViews(recipients: LotTraceSnapshot["recipients"], backHref?: string): LotTraceRecipientView[] {
  return recipients.map(recipient => ({
    id: recipient.id, orderNo: recipient.order_no, orderHref: backHref ? `/orders/${recipient.id}` : undefined,
    customer: recipient.customers ? { ...recipient.customers, href: backHref ? `/customers/${recipient.customers.id}` : undefined } : undefined,
    shipTo: recipient.ship_tos ? [recipient.ship_tos.label, shipToAddress(recipient.ship_tos)].filter(Boolean).join(" · ") : undefined,
    shipments: recipient.shipments.map(shipment => ({ id: shipment.id, label: `${shipment.carrier ?? "Shipment"} ${shipment.tracking ?? ""}`, invoices: shipment.invoices.map(invoice => ({ id: invoice.id, number: invoice.invoice_no, href: backHref ? `/invoices/${invoice.id}` : undefined })) })),
  }));
}

/** `timeZone` is breweries.timezone: a transfer or movement is dated by the brewery's day, not its UTC prefix (#442). */
export function toLotTraceViewProps(s: LotTraceSnapshot, timeZone: string, backHref?: string): LotTraceViewModel {
  const sku = ownedSku(s.lot.brand, s.movements[0]?.sku ?? "");
  return {
    backHref,
    title: s.lot.code,
    sku,
    skuDetail: `run ${s.run?.run_no ?? "?"} · packaged ${formatDate(s.lot.packaged_on)}${s.lot.best_by ? ` · best by ${formatDate(s.lot.best_by)}` : ""}`,
    skuTrailing: `${bblFixed(s.on_hand_bbl)} recorded balance`,
    tankBatch: [s.run?.vessel, s.batch?.batch_no != null ? batNo(s.batch.batch_no) : null, s.batch?.brewed_on ? `brewed ${formatDate(s.batch.brewed_on)}` : null].filter(Boolean).join(" · "),
    drawn: s.run?.bbl_drawn != null ? bblFixed(s.run.bbl_drawn) : "—",
    memberBatches: s.batches.map(batch => ({ key: batch.id, title: batNo(batch.batch_no), detail: batch.brewed_on ? `brewed ${formatDate(batch.brewed_on)}` : "Brew date not recorded" })),
    sourceTransfers: s.transfers.map(transfer => ({ key: transfer.id, title: `${transfer.from_vessel} to ${transfer.to_vessel}`, detail: formatDate(transfer.at, timeZone), trailing: `${bblFixed(Number(transfer.bbl))} transferred` })),
    ingredients: s.ingredients.map(row => ({ key: `${row.material_id}:${row.lot_id}:${row.source}`, title: row.material, tracked: row.lot_id !== null, detail: `${row.code ?? "Untracked"} · ${row.source} · ${Number(row.qty)} ${row.unit}`, href: backHref && row.lot_id ? `/compliance/material-lots/${row.lot_id}` : undefined })),
    tape: s.movements.map((movement) => ({
      key: movement.id,
      label: `${movement.qty > 0 ? "+" : "−"}${Math.abs(movement.qty)} · ${sentenceCase(movement.type)} · ${ownedSku(s.lot.brand, movement.sku)} · ${movement.location}`,
      when: formatDate(movement.created_at, timeZone),
    })),
    balances: s.balances.map((balance) => ({ key: `${balance.sku_id}:${balance.bin_id}`, title: ownedSku(s.lot.brand, balance.sku), detail: `${balance.location} · ${balance.bin}`, trailing: `${balance.qty} units · ${bblFixed(balance.bbl)}` })),
    recipientsEmpty: s.recipients.length ? undefined : "No recorded shipments of this lot",
    recipients: toRecipientViews(s.recipients, backHref),
    movements: s.movements.map((movement) => ({
      id: movement.id,
      title: `${movement.qty > 0 ? "+" : ""}${movement.qty} · ${sentenceCase(movement.type)} · ${ownedSku(s.lot.brand, movement.sku)}`,
      detail: `${movement.location} · ${movement.bin} · ${formatDate(movement.created_at, timeZone)}`,
      trailing: `${movement.bbl} bbl recorded`,
      sourceHref: movement.source_movement_id ? `#movement-${movement.source_movement_id}` : undefined,
      reference: movement.ref_label ?? undefined,
      referenceHref: backHref && movement.ref && movement.ref_kind === "invoice" ? `/invoices/${movement.ref}` : undefined,
    })),
    note: s.warning,
  };
}
