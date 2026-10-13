// lib/mgr/lot-trace-view.ts — view-model for Lot trace.
import { calendarDay } from "./calendar-day";
import { sentenceCase } from "./labels";
import { bblFixed } from "@/lib/volume";

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
  sourceMovementId?: string;
  sourceHref?: string;
  reference?: string;
  creditMemo?: boolean;
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
  movements: { id: string; type: string; qty: number; bbl: number; bin: string; ref: string | null; source_movement_id: string | null; created_at: string; sku: string; location: string }[];
  on_hand_bbl: number;
  warning: string;
  balances: { sku_id: string; bin_id: string; sku: string; bin: string; location: string; qty: number; bbl: number }[];
  recipients: { id: string; order_no: number; customers: { id: string; name: string } | null; ship_tos: { label: string; address1: string; city: string; state: string; zip: string } | null; shipments: { id: string; carrier: string | null; tracking: string | null; invoices: { id: string; invoice_no: number }[] }[] }[];
};

const ownedSku = (brand: string, sku: string) =>
  sku.startsWith(`${brand} ·`) ? sku : [brand, sku].filter(Boolean).join(" · ");

/** Both recall directions display the same authorized orders, addresses, shipments and invoices. */
export function toRecipientViews(recipients: LotTraceSnapshot["recipients"], backHref?: string): LotTraceRecipientView[] {
  return recipients.map(recipient => ({
    id: recipient.id, orderNo: recipient.order_no, orderHref: backHref ? `/orders/${recipient.id}` : undefined,
    customer: recipient.customers ? { ...recipient.customers, href: backHref ? `/customers/${recipient.customers.id}` : undefined } : undefined,
    shipTo: recipient.ship_tos ? `${recipient.ship_tos.label} · ${recipient.ship_tos.address1}, ${recipient.ship_tos.city}, ${recipient.ship_tos.state} ${recipient.ship_tos.zip}` : undefined,
    shipments: recipient.shipments.map(shipment => ({ id: shipment.id, label: `${shipment.carrier ?? "Shipment"} ${shipment.tracking ?? ""}`, invoices: shipment.invoices.map(invoice => ({ id: invoice.id, number: invoice.invoice_no, href: backHref ? `/invoices/${invoice.id}` : undefined })) })),
  }));
}

export function toLotTraceViewProps(s: LotTraceSnapshot, backHref?: string): LotTraceViewModel {
  const sku = ownedSku(s.lot.brand, s.movements[0]?.sku ?? "");
  return {
    backHref,
    title: s.lot.code,
    sku,
    skuDetail: `run ${s.run?.run_no ?? "?"} · packaged ${calendarDay(s.lot.packaged_on)}${s.lot.best_by ? ` · best by ${calendarDay(s.lot.best_by)}` : ""}`,
    skuTrailing: `${bblFixed(s.on_hand_bbl)} recorded balance`,
    tankBatch: [s.run?.vessel, s.batch?.batch_no != null ? `batch ${s.batch.batch_no}` : null, s.batch?.brewed_on ? `brewed ${calendarDay(s.batch.brewed_on)}` : null].filter(Boolean).join(" · "),
    drawn: s.run?.bbl_drawn != null ? bblFixed(s.run.bbl_drawn) : "—",
    memberBatches: s.batches.map(batch => ({ key: batch.id, title: `Batch ${batch.batch_no ?? "?"}`, detail: batch.brewed_on ? `brewed ${calendarDay(batch.brewed_on)}` : "Brew date not recorded" })),
    sourceTransfers: s.transfers.map(transfer => ({ key: transfer.id, title: `${transfer.from_vessel} to ${transfer.to_vessel}`, detail: calendarDay(transfer.at), trailing: `${bblFixed(Number(transfer.bbl))} transferred` })),
    ingredients: s.ingredients.map(row => ({ key: `${row.material_id}:${row.lot_id}:${row.source}`, title: row.material, tracked: row.lot_id !== null, detail: `${row.code ?? "Untracked"} · ${row.source} · ${Number(row.qty)} ${row.unit}`, href: backHref && row.lot_id ? `/compliance/material-lots/${row.lot_id}` : undefined })),
    tape: s.movements.map((movement) => ({
      key: movement.id,
      label: `${movement.qty > 0 ? "+" : "−"}${Math.abs(movement.qty)} · ${sentenceCase(movement.type)} · ${ownedSku(s.lot.brand, movement.sku)} · ${movement.location}`,
      when: calendarDay(movement.created_at),
    })),
    balances: s.balances.map((balance) => ({ key: `${balance.sku_id}:${balance.bin_id}`, title: ownedSku(s.lot.brand, balance.sku), detail: `${balance.location} · ${balance.bin}`, trailing: `${balance.qty} units · ${bblFixed(balance.bbl)}` })),
    recipientsEmpty: s.recipients.length ? undefined : "No recorded shipments of this lot",
    recipients: toRecipientViews(s.recipients, backHref),
    movements: s.movements.map((movement) => ({
      id: movement.id,
      title: `${movement.qty > 0 ? "+" : ""}${movement.qty} · ${sentenceCase(movement.type)} · ${ownedSku(s.lot.brand, movement.sku)}`,
      detail: `${movement.location} · ${movement.bin} · ${calendarDay(movement.created_at)}`,
      trailing: `${movement.bbl} bbl recorded`,
      sourceMovementId: movement.source_movement_id ?? undefined,
      sourceHref: movement.source_movement_id ? `#movement-${movement.source_movement_id}` : undefined,
      reference: movement.ref ?? undefined,
      creditMemo: Boolean(movement.ref && (movement.type === "return_in" || (movement.type === "loss" && movement.source_movement_id))),
      referenceHref: backHref && movement.ref && (movement.type === "return_in" || (movement.type === "loss" && movement.source_movement_id)) ? `/invoices/${movement.ref}` : undefined,
    })),
    note: s.warning,
  };
}
