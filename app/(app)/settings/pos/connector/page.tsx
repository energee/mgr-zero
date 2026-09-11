import { SquareConnectorView } from "@/components/mgr/views/pos";
import { E } from "@/components/mgr/e";
import { requireAdminContext } from "@/lib/brewery";
import { PosRouteSheet } from "@/components/mgr/views/pos-controls";

export default async function SquareConnectorPage() {
  await requireAdminContext("Square to QuickBooks connector");
  return <>{E.back("Point of sale", "Square and QuickBooks connector", undefined, "/settings/pos")}<PosRouteSheet title="Square and QuickBooks connector" backHref="/settings/pos"><SquareConnectorView live /></PosRouteSheet></>;
}
