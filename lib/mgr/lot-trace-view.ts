// lib/mgr/lot-trace-view.ts — view-model for Lot trace.
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

export type LotTraceViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  sku: string;
  skuDetail: string;
  skuTrailing: string;
  tankBatch: string;
  drawn: string;
  tape: LotTraceTapeView[];
  balances: LotTraceRowView[];
  recipientsEmpty?: string;
  recipients?: LotTraceRecipientView[];
  movements?: LotTraceMovementView[];
  note: string;
};

export type LotTraceSnapshot = {
  lot: { code: string; brand: string; packaged_on: string; best_by: string | null };
  run: { run_no: number | null; bbl_drawn: number | null; vessel: string } | null;
  batch: { batch_no: number | null; brewed_on: string | null } | null;
  movements: { id: string; type: string; qty: number; bbl: number; bin: string; ref: string | null; source_movement_id: string | null; created_at: string; sku: string; location: string }[];
  on_hand_bbl: number;
  warning: string;
  balances: { sku_id: string; bin_id: string; sku: string; bin: string; location: string; qty: number; bbl: number }[];
  recipients: { id: string; order_no: number; customers: { id: string; name: string } | null; ship_tos: { label: string; address1: string; city: string; state: string; zip: string } | null; shipments: { id: string; carrier: string | null; tracking: string | null; invoices: { id: string; invoice_no: number }[] }[] }[];
};

export function toLotTraceViewProps(s: LotTraceSnapshot, backHref?: string): LotTraceViewModel {
  const sku = s.movements[0]?.sku ?? "";
  return {
    backHref,
    title: s.lot.code,
    sku: sku.startsWith(`${s.lot.brand} ·`) ? sku : [s.lot.brand, sku].filter(Boolean).join(" · "),
    skuDetail: `run ${s.run?.run_no ?? "?"} · packaged ${s.lot.packaged_on}${s.lot.best_by ? ` · best by ${s.lot.best_by}` : ""}`,
    skuTrailing: `${s.on_hand_bbl.toFixed(2)} bbl recorded balance`,
    tankBatch: [s.run?.vessel, s.batch?.batch_no != null ? `batch ${s.batch.batch_no}` : null, s.batch?.brewed_on ? `brewed ${s.batch.brewed_on}` : null].filter(Boolean).join(" · "),
    drawn: s.run?.bbl_drawn != null ? `${Number(s.run.bbl_drawn).toFixed(2)} bbl` : "—",
    tape: s.movements.map((movement) => ({
      key: movement.id,
      label: `${movement.qty > 0 ? "+" : "−"}${Math.abs(movement.qty)} · ${movement.type.replace(/_/g, " ")} · ${movement.sku} · ${movement.location}`,
      when: movement.created_at.slice(5, 10).replace("-", "/"),
    })),
    balances: s.balances.map((balance) => ({ key: `${balance.sku_id}:${balance.bin_id}`, title: balance.sku, detail: `${balance.location} · ${balance.bin}`, trailing: `${balance.qty} units · ${balance.bbl.toFixed(2)} bbl` })),
    recipientsEmpty: s.recipients.length ? undefined : "No recorded shipments of this lot",
    recipients: s.recipients.map((recipient) => ({
      id: recipient.id,
      orderNo: recipient.order_no,
      orderHref: backHref ? `/orders/${recipient.id}` : undefined,
      customer: recipient.customers ? { ...recipient.customers, href: backHref ? `/customers/${recipient.customers.id}` : undefined } : undefined,
      shipTo: recipient.ship_tos ? `${recipient.ship_tos.label} · ${recipient.ship_tos.address1}, ${recipient.ship_tos.city}, ${recipient.ship_tos.state} ${recipient.ship_tos.zip}` : undefined,
      shipments: recipient.shipments.map((shipment) => ({ id: shipment.id, label: `${shipment.carrier ?? "Shipment"} ${shipment.tracking ?? ""}`, invoices: shipment.invoices.map((invoice) => ({ id: invoice.id, number: invoice.invoice_no, href: backHref ? `/invoices/${invoice.id}` : undefined })) })),
    })),
    movements: s.movements.map((movement) => ({
      id: movement.id,
      title: `${movement.qty > 0 ? "+" : ""}${movement.qty} · ${movement.type.replace(/_/g, " ")} · ${movement.sku}`,
      detail: `${movement.location} · ${movement.bin} · ${movement.created_at.slice(0, 10)}`,
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
