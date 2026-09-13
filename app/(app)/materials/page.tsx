// app/(app)/materials/page.tsx — Beer › Materials: material definitions
// (list_materials) with on hand summed across bins (get_material_on_hand).
// Edit is material-form.tsx → upsert_material; Count is count-form.tsx →
// record_material_count at one bin.
import { MaterialsOnHandView } from "@/components/mgr/views/materials-on-hand";
import { MaterialsView } from "@/components/mgr/views/materials";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toMaterialsOnHandViewProps } from "@/lib/mgr/materials-on-hand-view";
import { toMaterialsViewProps } from "@/lib/mgr/materials-view";
import "@/lib/commands/all";
import { MaterialForm, type Material } from "./material-form";
import { CountForm } from "./count-form";

type OnHand = { material_id: string; location_id: string; bin_id: string; qty: number };
type Vendor = { id: string; name: string };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [materials, onHand, vendors, locations, bins] = (await Promise.all([
    runCommand("list_materials", { includeInactive: true }, ctx), runCommand("get_material_on_hand", {}, ctx),
    runCommand("list_vendors", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx),
  ])) as [Material[], OnHand[], Vendor[], Location[], Bin[]];
  const onHandBy = Map.groupBy(onHand, (o) => o.material_id);
  const total = (id: string) => (onHandBy.get(id) ?? []).reduce((a, o) => a + Number(o.qty), 0);

  if (view === "definitions") return <MaterialsView model={toMaterialsViewProps({
    backHref: "/vendors",
    rows: materials.map(material => ({ key: material.id, title: material.name, detail: `${material.category} · ${material.base_uom} · ${total(material.id).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${material.base_uom} on hand${material.active ? "" : " · inactive"}`, verb: "Edit" })),
  })} createAction={<MaterialForm vendors={vendors} />}
    rowAction={row => <MaterialForm material={materials.find(material => material.id === row.key)!} vendors={vendors} />} />;

  return (
    <MaterialsOnHandView
      model={toMaterialsOnHandViewProps({
        backHref: "/beer",
        rows: materials.map((m) => ({
          key: m.id,
          title: m.name,
          detail: `${m.category} · ${m.base_uom} · ${total(m.id).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${m.base_uom} on hand${m.lot_tracked ? " · lot-tracked" : ""}${m.active ? "" : " · inactive"}`,
          verb: "Count",
          tone: "info",
          disabled: !m.active,
        })),
      })}
      createAction={<MaterialForm vendors={vendors} />}
      definitionsHref="/materials?view=definitions"
      rowTrailing={(row) => {
        const m = materials.find((x) => x.id === row.key)!;
        return (
          <CountForm materialId={m.id} materialName={m.name} uom={m.base_uom} locations={locations} bins={bins} onHand={onHandBy.get(m.id) ?? []} />
        );
      }}
    />
  );
}
