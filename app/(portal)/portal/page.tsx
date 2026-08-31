// app/(portal)/portal/page.tsx — Shop: catalog (portal_catalog) + cart. The
// ship-to list has no portal command (RLS's customer_own policy lets the
// caller read their own ship_tos directly), so it's queried here via ctx.db
// rather than adding a command for a single select-list read.
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand, unwrap } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { Cart, type CatalogItem, type ShipToOption } from "./cart";

type ShipToRow = { id: string; label: string; city: string; state: string };

export default async function ShopPage() {
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);

  const [items, shipTos] = await Promise.all([
    runCommand("portal_catalog", {}, ctx) as Promise<CatalogItem[]>,
    unwrap(
      ctx.db.from("ship_tos").select("id, label, city, state").eq("customer_id", customer.customerId).order("label")
    ) as Promise<ShipToRow[]>,
  ]);

  const shipToOptions: ShipToOption[] = shipTos.map((s) => ({ id: s.id, label: `${s.label} (${s.city}, ${s.state})` }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Shop</h1>
      {items.length ? (
        <Cart items={items} shipTos={shipToOptions} />
      ) : (
        <p className="text-sm text-muted-foreground">No products available yet.</p>
      )}
    </div>
  );
}
