// app/(app)/materials/page.tsx — Beer › Materials on hand: every material
// (list_materials) with on hand summed across bins (get_material_on_hand).
// Each row's Edit is material-form.tsx → upsert_material; its Count is
// count-form.tsx → record_material_count at one bin. Count sheet is the same
// form over every listed material held in one bin. ?q= narrows list_materials
// by name, as Catalog's search does, and ?category= by type (the Type pick).
import { z } from "zod";
import { MaterialsOnHandView } from "@/components/mgr/views/materials-on-hand";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { canRun } from "@/lib/commands/registry";
import { toMaterialsOnHandViewProps, toMaterialsScopes } from "@/lib/mgr/materials-on-hand-view";
import { MATERIAL_CATEGORIES } from "@/lib/mgr/enums";
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
  category: z.enum(["", ...MATERIAL_CATEGORIES]).catch(""),
});

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { params, queryWith, hrefWith } = listParams(materialsParams, await searchParams);
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [materials, onHand, vendors, locations, bins] = (await Promise.all([
    runCommand("list_materials", { includeInactive: true, q: params.q, category: params.category || undefined }, ctx), runCommand("get_material_on_hand", {}, ctx),
    runCommand("list_vendors", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx),
  ])) as [Material[], OnHand[], Vendor[], Location[], Bin[]];
  const onHandBy = Map.groupBy(onHand, (o) => o.material_id);
  const total = (id: string) => (onHandBy.get(id) ?? []).reduce((a, o) => a + Number(o.qty), 0);
  const countable = (m: Material) => ({ id: m.id, name: m.name, uom: m.base_uom });

  return (
    <MaterialsOnHandView
      model={toMaterialsOnHandViewProps({
        backHref: "/beer",
        purchaseOrdersHref: canRun(ctx, "list_purchase_orders") ? "/purchase-orders" : null,
        rows: materials.map((m) => ({
          key: m.id, name: m.name, category: m.category, unit: m.base_uom, onHand: total(m.id), lotTracked: m.lot_tracked, active: m.active,
        })),
        filtered: Boolean(params.q || params.category),
      })}
      controls={materials.length || params.q || params.category ? <ListControls
        // Search carries the type along, including when typing replaces the URL.
        search={{ label: "Search materials", value: params.q, keep: Object.fromEntries(queryWith({ q: "" })), path: "/materials" }}
        scopes={toMaterialsScopes({ category: params.category, href: patch => hrefWith("/materials", patch) })} /> : undefined}
      countSheet={<CountForm sheet materials={materials.map(countable)} locations={locations} bins={bins} onHand={materials.flatMap((m) => onHandBy.get(m.id) ?? [])} />}
      createAction={<MaterialForm vendors={vendors} />}
      rowEdit={(row) => <MaterialForm material={materials.find((m) => m.id === row.key)!} vendors={vendors} />}
      rowCount={(row) => {
        const m = materials.find((x) => x.id === row.key)!;
        return (
          <CountForm materials={[countable(m)]} locations={locations} bins={bins} onHand={onHandBy.get(m.id) ?? []} />
        );
      }}
    />
  );
}
