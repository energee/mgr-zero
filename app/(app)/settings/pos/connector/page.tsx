import { SquareConnectorView } from "@/components/mgr/views/pos";
import { E } from "@/components/mgr/e";
import { requireAdminContext } from "@/lib/brewery";
import { PosRouteSheet } from "@/components/mgr/views/pos-controls";

export default async function SquareConnectorPage() {
  await requireAdminContext("Taproom sales in QuickBooks");
  return <>{E.back("Point of sale", "Taproom sales in QuickBooks", undefined, "/settings/pos")}<PosRouteSheet title="Taproom sales in QuickBooks" backHref="/settings/pos"><SquareConnectorView accountingHref="/settings/accounting" /></PosRouteSheet></>;
}
