// app/(portal)/portal/orders/[id]/page.tsx — Order detail (screen record):
// one order's buyer-facing status, ship-to, lines (ordered vs shipped) and
// the invoice once the brewery has billed (portal_order + portal_invoices).
// Drafts continue in the scoped cart; shipped orders reorder at current prices.
// Staff edits after confirmation show as plain adjusted copy.
import { PortalOrderView } from "@/components/mgr/views/portal-order";
import { getPortalContext } from "@/lib/portal";
import { runCommand } from "@/lib/commands/registry";
import { orNotFound } from "@/lib/mgr/not-found";
import { toPortalOrderViewProps, type PortalOrderSnapshot } from "@/lib/mgr/portal-order-view";
import "@/lib/commands/all";
import { cache } from "react";

const getOrderData = cache(async function getOrderData(id: string) {
  const { ctx } = await getPortalContext();
  return orNotFound(runCommand("portal_order", { orderId: id }, ctx) as Promise<PortalOrderSnapshot>);
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getOrderData(id);
  return {};
}

export default async function PortalOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await getOrderData(id);
  return (
    <PortalOrderView
      model={toPortalOrderViewProps({ ...snapshot, backHref: "/portal/orders" })}
      linkRows
      reorderHref={`/portal?reorder=${snapshot.order.id}`}
      continueHref={snapshot.order.status === "draft" ? `/portal?draft=${snapshot.order.id}` : undefined}
    />
  );
}
