import { SquareConnectorView } from "@/components/mgr/views/pos";
import PosPage from "../page";
import { requireAdminContext } from "@/lib/brewery";
import { PosRouteSheet } from "@/components/mgr/views/pos-controls";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/settings/pos/connector") };

export default async function SquareConnectorPage() {
  await requireAdminContext("Taproom sales in QuickBooks");
  return <><PosPage searchParams={Promise.resolve({})} /><PosRouteSheet title="Taproom sales in QuickBooks" backHref="/settings/pos"><SquareConnectorView accountingHref="/settings/accounting" /></PosRouteSheet></>;
}
