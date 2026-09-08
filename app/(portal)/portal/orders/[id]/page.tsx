// app/(portal)/portal/orders/[id]/page.tsx — Order detail (screen record):
// one order's buyer-facing status, ship-to, lines (ordered vs shipped) and
// the invoice once the brewery has billed (portal_order + portal_invoices).
// Read-only: the portal has no lifecycle actions beyond the cart's
// create+submit. Staff edits after confirmation show as plain adjusted copy.
import { E } from "@/components/mgr/e";
import { PortalOrderView } from "@/components/mgr/views/portal-order";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { orNotFound } from "@/lib/mgr/not-found";
import { toPortalOrderViewProps, type PortalOrderSnapshot } from "@/lib/mgr/portal-order-view";
import "@/lib/commands/all";

export default async function PortalOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const snapshot = await orNotFound(
    runCommand("portal_order", { orderId: id }, ctx) as Promise<PortalOrderSnapshot>,
  );
  return (
    <PortalOrderView
      model={toPortalOrderViewProps(snapshot)}
      linkRows
      reorderHref={`/portal?reorder=${snapshot.order.id}`}
      footer={snapshot.order.status === "draft" ? E.btn("Continue / edit", "p", `/portal?draft=${snapshot.order.id}`) : undefined}
    />
  );
}
