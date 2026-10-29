// app/(app)/vendors/[id]/page.tsx — More › Vendors › one vendor (#1586): its
// facts, its contracts read-only, its open purchase orders (Admin and
// Warehouse only, the roles list_purchase_orders admits) and the materials
// whose default vendor it is, inactive ones included. Edit opens the same
// VendorForm sheet the Vendors list uses, which holds Deactivate vendor.
import { VendorDetailView } from "@/components/mgr/views/vendor-detail";
import { canRun } from "@/lib/commands/registry";
import { runPageQuery } from "@/lib/mgr/page-query";
import { navTitle } from "@/lib/mgr/nav";
import { toVendorDetailViewProps, type VendorMaterial, type VendorPo } from "@/lib/mgr/vendor-detail-view";
import "@/lib/commands/all";
import { getVendorPageData } from "../vendor-data";
import { VendorForm } from "../vendor-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getVendorPageData(id);
  return { title: navTitle("/vendors") };
}

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, vendor } = await getVendorPageData(id);
  const [purchaseOrders, materials] = (await Promise.all([
    canRun(ctx, "list_purchase_orders") ? runPageQuery("list_purchase_orders", { vendorId: id }, ctx) : null,
    runPageQuery("list_materials", { defaultVendorId: id, includeInactive: true }, ctx),
  ])) as [VendorPo[] | null, VendorMaterial[]];
  return (
    <VendorDetailView
      model={toVendorDetailViewProps({ backHref: "/vendors", vendor: { ...vendor, key: vendor.id }, purchaseOrders, materials })}
      editAction={<VendorForm vendor={vendor} />}
      linkRows
    />
  );
}
