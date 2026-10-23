// app/(app)/materials/page.tsx — Beer › Materials: material definitions
// (list_materials) with on hand summed across bins (get_material_on_hand).
// Edit is material-form.tsx → upsert_material; Count is count-form.tsx →
// record_material_count at one bin. ?q= narrows list_materials by name, as
// Catalog's search does; only the on-hand view draws the search box.
import { z } from "zod";
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
import { ListControls } from "@/components/mgr/list-controls";
import { listParams } from "@/lib/mgr/list-params";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/materials") };

type OnHand = { material_id: string; location_id: string; bin_id: string; qty: number };
type Vendor = { id: string; name: string };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

const materialsParams = z.object({
  q: z.string().trim().max(100).catch(""),
  view: z.string().catch(""),
});

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { params } = listParams(materialsParams, await searchParams);
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [materials, onHand, vendors, locations, bins] = (await Promise.all([
    // Definitions draw no search box, so a hand-typed ?q= must not narrow them.
    runCommand("list_materials", { includeInactive: true, q: params.view === "definitions" ? "" : params.q }, ctx), runCommand("get_material_on_hand", {}, ctx),
    runCommand("list_vendors", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx),
  ])) as [Material[], OnHand[], Vendor[], Location[], Bin[]];
  const onHandBy = Map.groupBy(onHand, (o) => o.material_id);
  const total = (id: string) => (onHandBy.get(id) ?? []).reduce((a, o) => a + Number(o.qty), 0);

  if (params.view === "definitions") return <MaterialsView model={toMaterialsViewProps({
    backHref: "/materials",
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
        filtered: Boolean(params.q),
      })}
      controls={materials.length || params.q ? <ListControls search={{ label: "Search materials", value: params.q, keep: {} }} /> : undefined}
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
