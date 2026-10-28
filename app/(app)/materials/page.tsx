// app/(app)/materials/page.tsx — Beer › Materials on hand: every material
// (list_materials) with on hand summed across bins (get_material_on_hand).
// Each row's Edit is material-form.tsx → upsert_material; its Count is
// count-form.tsx → record_material_count at one bin. ?q= narrows list_materials
// by name, as Catalog's search does.
import { z } from "zod";
import { MaterialsOnHandView } from "@/components/mgr/views/materials-on-hand";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { canRun } from "@/lib/commands/registry";
import { toMaterialsOnHandViewProps } from "@/lib/mgr/materials-on-hand-view";
import "@/lib/commands/all";
import { MaterialForm, type Material } from "./material-form";
import { CountForm } from "./count-form";
import { ListControls } from "@/components/mgr/list-controls";
import { listParams, searchQuery } from "@/lib/mgr/list-params";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/materials") };

type OnHand = { material_id: string; location_id: string; bin_id: string; qty: number };
type Vendor = { id: string; name: string };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

const materialsParams = z.object({
  q: searchQuery,
});

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { params } = listParams(materialsParams, await searchParams);
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [materials, onHand, vendors, locations, bins] = (await Promise.all([
    runCommand("list_materials", { includeInactive: true, q: params.q }, ctx), runCommand("get_material_on_hand", {}, ctx),
    runCommand("list_vendors", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx),
  ])) as [Material[], OnHand[], Vendor[], Location[], Bin[]];
  const onHandBy = Map.groupBy(onHand, (o) => o.material_id);
  const total = (id: string) => (onHandBy.get(id) ?? []).reduce((a, o) => a + Number(o.qty), 0);

  return (
    <MaterialsOnHandView
      model={toMaterialsOnHandViewProps({
        backHref: "/beer",
        purchaseOrdersHref: canRun(ctx, "list_purchase_orders") ? "/purchase-orders" : null,
        rows: materials.map((m) => ({
          key: m.id,
          title: m.name,
          detail: `${m.category} · ${m.base_uom} · ${total(m.id).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${m.base_uom} on hand${m.lot_tracked ? " · lot-tracked" : ""}${m.active ? "" : " · inactive"}`,
        })),
        filtered: Boolean(params.q),
      })}
      controls={materials.length || params.q ? <ListControls search={{ label: "Search materials", value: params.q, keep: {}, path: "/materials" }} /> : undefined}
      createAction={<MaterialForm vendors={vendors} />}
      rowEdit={(row) => <MaterialForm material={materials.find((m) => m.id === row.key)!} vendors={vendors} />}
      rowCount={(row) => {
        const m = materials.find((x) => x.id === row.key)!;
        return (
          <CountForm materialId={m.id} materialName={m.name} uom={m.base_uom} locations={locations} bins={bins} onHand={onHandBy.get(m.id) ?? []} />
        );
      }}
    />
  );
}
