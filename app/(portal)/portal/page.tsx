// app/(portal)/portal/page.tsx — Shop (screen record): the buyer catalog
// (portal_catalog) and cart (cart.tsx). The ship-to list has no portal
// command (RLS's customer_own policy lets the caller read their own ship_tos
// directly), so it's queried here via ctx.db rather than adding a command
// for a single select-list read. Live catalog stays Cart (E.stq is not a
// controlled input); ShopView draws the Order heading.
import { ShopView } from "@/components/mgr/views/shop";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand, unwrap } from "@/lib/commands/registry";
import { toShopViewProps } from "@/lib/mgr/shop-view";
import "@/lib/commands/all";
import { Cart, type CatalogItem, type ShipToOption } from "./cart";

type ShipToRow = { id: string; label: string; city: string; state: string };

export default async function ShopPage() {
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const [items, shipTos] = await Promise.all([
    runCommand("portal_catalog", {}, ctx) as Promise<CatalogItem[]>,
    unwrap(ctx.db.from("ship_tos").select("id, label, city, state").eq("customer_id", customer.customerId).order("label")) as Promise<ShipToRow[]>,
  ]);
  const shipToOptions: ShipToOption[] = shipTos.map((s) => ({ id: s.id, label: `${s.label} (${s.city}, ${s.state})` }));
  return (
    <ShopView
      model={toShopViewProps({
        customer: { id: customer.customerId, name: customer.customerName },
        shipTos: shipTos.map((s) => ({ id: s.id, label: s.label, address1: "", city: s.city, state: s.state, zip: "" })),
        shipToId: shipTos[0]?.id ?? "",
        requestedDate: "",
        source: { name: "Warehouse" },
        catalog: items.map((i) => ({ skuId: i.skuId, name: i.name, product: i.product, unitPriceCents: i.unitPriceCents, badge: "in", qty: 0 })),
        depositCentsPerKeg: 3000,
      })}
      catalog={items.length ? <Cart items={items} shipTos={shipToOptions} /> : undefined}
      comingUp={null}
      footer={null}
    />
  );
}
