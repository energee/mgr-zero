// app/(app)/replenishment/page.tsx — taproom replenishment: pick a taproom
// (via ?location=) to see its par/on-hand/suggested gap per SKU from
// replenishment_suggestions, then create-replenish-form.tsx picks a source
// warehouse and submits create_replenishment_order.
import Link from "next/link";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { ReplenishForm } from "./replenish-form";

type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" };
type Suggestion = { skuId: string; sku: string; par: number; onHand: number; suggested: number };

export default async function ReplenishmentPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const locationRows = (await runCommand("list_locations", {}, ctx)) as LocationRow[];
  const taprooms = locationRows.filter((l) => l.kind === "taproom");
  const warehouses = locationRows.filter((l) => l.kind === "warehouse");
  const toLocationId = location ?? taprooms[0]?.id;

  const suggestions = toLocationId
    ? ((await runCommand("replenishment_suggestions", { locationId: toLocationId }, ctx)) as Suggestion[])
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Taproom replenishment</h1>

      {taprooms.length ? (
        <div className="flex items-center gap-2 text-sm">
          {taprooms.map((t) => (
            <Link
              key={t.id}
              href={`/replenishment?location=${t.id}`}
              className={t.id === toLocationId ? "font-medium underline underline-offset-2" : "text-muted-foreground"}
            >
              {t.name}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No taprooms configured.</p>
      )}

      {toLocationId && (
        <ReplenishForm toLocationId={toLocationId} warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} suggestions={suggestions} />
      )}
    </div>
  );
}
