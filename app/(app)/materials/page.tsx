// app/(app)/materials/page.tsx — Beer › Materials: material definitions
// (list_materials) with on hand summed across bins (get_material_on_hand).
// Edit is material-form.tsx → upsert_material; Count is count-form.tsx →
// record_material_count at one bin.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { MaterialForm, type Material } from "./material-form";
import { CountForm } from "./count-form";

type OnHand = { material_id: string; location_id: string; bin_id: string; qty: number };
type Vendor = { id: string; name: string };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export default async function MaterialsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [materials, onHand, vendors, locations, bins] = (await Promise.all([
    runCommand("list_materials", { includeInactive: true }, ctx), runCommand("get_material_on_hand", {}, ctx),
    runCommand("list_vendors_and_contracts", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx),
  ])) as [Material[], OnHand[], Vendor[], Location[], Bin[]];
  const options = vendors.map((v) => ({ id: v.id, name: v.name }));
  const onHandBy = Map.groupBy(onHand, (o) => o.material_id);
  const total = (id: string) => (onHandBy.get(id) ?? []).reduce((a, o) => a + Number(o.qty), 0);

  return (
    <>
      {E.hd("Materials", "definitions and on hand", <MaterialForm vendors={options} />)}
      {materials.length === 0
        ? E.blank("No materials yet")
        : materials.map((m) => (
            <div key={m.id}>
              {E.row(m.name,
                `${m.category} · ${m.base_uom} · ${total(m.id).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${m.base_uom} on hand${m.lot_tracked ? " · lot-tracked" : ""}${m.active ? "" : " · inactive"}`,
                <span className="flex gap-1">
                  <CountForm materialId={m.id} materialName={m.name} uom={m.base_uom} locations={locations} bins={bins} onHand={onHandBy.get(m.id) ?? []} />
                  <MaterialForm material={m} vendors={options} />
                </span>,
                m.active ? "" : "dis")}
            </div>
          ))}
    </>
  );
}
