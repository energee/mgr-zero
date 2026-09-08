// app/(app)/compliance/lots/[id]/page.tsx — Lot trace (screen record Lot
// trace): the lot, its packaging run, tank and batch, and every ledger
// movement that names the lot, with the actual shipment recipients.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { treatmentLabel } from "@/app/(app)/settings/channels/tax-treatments";

type Trace = {
  lot: { id: string; code: string; brand: string; packaged_on: string; best_by: string | null };
  run: { id: string; run_no: number | null; bbl_drawn: number | null; vessel: string } | null;
  batch: { id: string; batch_no: number | null; brewed_on: string | null } | null;
  movements: { id: string; type: string; qty: number; bbl: number; bin: string; ref: string | null; source_movement_id: string | null; created_at: string; sku: string; location: string }[];
  on_hand_bbl: number; warning: string;
  balances: { sku_id: string; bin_id: string; sku: string; bin: string; location: string; qty: number; bbl: number }[];
  recipients: { id: string; order_no: number; customers: { id: string; name: string } | null; ship_tos: { label: string; address1: string; city: string; state: string; zip: string } | null; shipments: { id: string; carrier: string | null; tracking: string | null; invoices: { id: string; invoice_no: number }[] }[] }[];
};

export default async function LotTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const t = (await orNotFound(runCommand("trace_lot", { lotId: id }, ctx))) as Trace;
  return (
    <>
      {E.back("Compliance months", t.lot.code, undefined, "/compliance")}
      {E.row([t.lot.brand, t.movements[0]?.sku].filter(Boolean).join(" · "), `run ${t.run?.run_no ?? "?"} · packaged ${t.lot.packaged_on}${t.lot.best_by ? ` · best by ${t.lot.best_by}` : ""}`, `${t.on_hand_bbl.toFixed(2)} bbl recorded balance`)}
      {E.fld("Tank · batch", [t.run?.vessel, t.batch?.batch_no != null ? `batch ${t.batch.batch_no}` : null, t.batch?.brewed_on ? `brewed ${t.batch.brewed_on}` : null].filter(Boolean).join(" · "))}
      {E.fld("Drawn", t.run?.bbl_drawn != null ? `${Number(t.run.bbl_drawn).toFixed(2)} bbl` : "—")}
      {E.ttl("Recorded balances by SKU and bin")}
      {t.balances.map(b => <div key={`${b.sku_id}:${b.bin_id}`}>{E.row(b.sku, `${b.location} · ${b.bin}`, `${b.qty} units · ${b.bbl.toFixed(2)} bbl`)}</div>)}
      {E.ttl("Recipients")}
      {!t.recipients.length && E.blank("No recorded shipments of this lot")}
      {t.recipients.map(o => <div key={o.id} className="flex flex-col gap-2 border-b py-3">
        <Link href={`/orders/${o.id}`} className="underline">Order {o.order_no}</Link>
        {o.customers && <Link href={`/customers/${o.customers.id}`} className="underline">{o.customers.name}</Link>}
        {o.ship_tos && <p>{o.ship_tos.label} · {o.ship_tos.address1}, {o.ship_tos.city}, {o.ship_tos.state} {o.ship_tos.zip}</p>}
        {o.shipments.map(sh => <div key={sh.id}><p>{sh.carrier ?? "Shipment"} {sh.tracking}</p>{sh.invoices.map(inv => <Link key={inv.id} href={`/invoices/${inv.id}`} className="underline">Invoice {inv.invoice_no}</Link>)}</div>)}
      </div>)}
      {E.ttl("Movements")}
      {t.movements.map(m => <div key={m.id} id={`movement-${m.id}`} className="border-b py-3">
        {E.row(`${m.qty > 0 ? "+" : ""}${m.qty} · ${treatmentLabel(m.type)} · ${m.sku}`, `${m.location} · ${m.bin} · ${m.created_at.slice(0, 10)}`, `${m.bbl} bbl recorded`)}
        {m.source_movement_id && <Link className="underline" href={`#movement-${m.source_movement_id}`}>Source movement {m.source_movement_id}</Link>}
        {m.ref && <p>{m.type === "return_in" || (m.type === "loss" && m.source_movement_id) ? <Link className="underline" href={`/invoices/${m.ref}`}>Credit memo {m.ref}</Link> : `Reference ${m.ref}`}</p>}
      </div>)}
      {E.note(t.warning)}
    </>
  );
}
