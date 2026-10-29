// app/(app)/purchase-orders/[id]/edit/page.tsx — Edit PO (#1584): a draft
// purchase order opens the shared New PO form on its saved vendor, expected
// date and lines, and saves through update_purchase_order. A sent or closed
// order returns to its page before the pickers load.
import { cache } from "react";
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import { breweryDate } from "@/lib/date-format";
import { poNo } from "@/lib/mgr/doc-no";
import { dollarsInput } from "@/lib/mgr/money";
import { navTitle } from "@/lib/mgr/nav";
import type { PoContract } from "@/lib/mgr/new-po-view";
import { NewPoForm } from "../../new-po-form";
import "@/lib/commands/all";

type Po = {
  id: string; po_no: number; vendor_id: string; status: string; expected_on: string | null;
  lines: { material_id: string; qty_ordered: number; unit_cost_cents: number | null; expected_lot_code: string | null }[];
};
type Vendor = { id: string; name: string; active: boolean; lead_time_days: number | null; contracts: PoContract[] };
type Material = { id: string; name: string; purchase_uom: string; lot_tracked: boolean; default_vendor_id: string | null };

const getEditPoData = cache(async function getEditPoData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "update_purchase_order", "Edit PO");
  const po = await orNotFound(runPageQuery("get_purchase_order", { poId: id }, ctx)) as Po;
  return { brewery, ctx, po };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getEditPoData(id);
  return { title: navTitle("/purchase-orders") };
}

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, ctx, po } = await getEditPoData(id);
  if (po.status !== "draft") redirect(`/purchase-orders/${po.id}`);
  const [vendors, materials] = await Promise.all([
    runPageQuery("list_vendors_and_contracts", {}, ctx) as Promise<Vendor[]>,
    runPageQuery("list_materials", {}, ctx) as Promise<Material[]>,
  ]);
  // The draft's own vendor stays choosable even if it was since made inactive.
  const choosable = vendors.filter(vendor => vendor.active || vendor.id === po.vendor_id);
  return <NewPoForm vendors={choosable.map(({ id, name, lead_time_days }) => ({ id, name, lead_time_days }))}
    contracts={vendors.flatMap(vendor => vendor.contracts)} materials={materials} today={breweryDate(brewery.timeZone)}
    draft={{
      id: po.id, title: `Edit ${poNo(po.po_no)}`, vendorId: po.vendor_id, expectedOn: po.expected_on ?? "",
      lines: po.lines.map(line => ({ materialId: line.material_id, qty: String(line.qty_ordered), cost: dollarsInput(line.unit_cost_cents), lot: line.expected_lot_code ?? "" })),
    }} />;
}
