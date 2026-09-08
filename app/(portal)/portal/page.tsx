import { E } from "@/components/mgr/e";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { Cart, type CatalogItem, type ShipToOption } from "./cart";

type ShipToRow = { id: string; label: string; city: string; state: string; is_default: boolean };

export default async function ShopPage() {
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const [items, account] = await Promise.all([
    runCommand("portal_catalog", {}, ctx) as Promise<CatalogItem[]>,
    runCommand("get_portal_account", {}, ctx) as Promise<{ shipTos: ShipToRow[] }>,
  ]);
  const shipToOptions: ShipToOption[] = account.shipTos.map((s) => ({ id: s.id, is_default: s.is_default, label: `${s.label} (${s.city}, ${s.state})` }));
  return (
    <>
      {E.hd("Order", customer.customerName)}
      {items.length ? <Cart items={items} shipTos={shipToOptions} /> : E.blank("Nothing is listed for wholesale yet. Call the brewery.")}
    </>
  );
}
