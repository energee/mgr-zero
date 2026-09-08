// app/(app)/planning/page.tsx — More › Planning: material gaps
// (get_material_requirements): what committed batches and packaging runs
// need, less on hand and open POs, resolved to a vendor, with the buy-by the
// view dated and whether it is already out of reach (the RPC skips those).
// Draft is draft-button.tsx (admin/warehouse).
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { DraftButton } from "./draft-button";

type Gap = {
  material_id: string; material_name: string | null; base_uom: string | null; purchase_uom: string | null;
  required: number; on_hand: number; on_order: number; short: number; purchase_units_short: number; needed_by: string | null;
  vendor_id: string | null; vendor_name: string | null; lead_time_days: number | null; buy_by: string | null; out_of_reach: boolean;
};

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

export default async function PlanningPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const gaps = ((await runCommand("get_material_requirements", {}, ctx)) as Gap[]).filter((g) => g.short > 0);
  const buyable = gaps.filter((g) => g.vendor_id && !g.out_of_reach);
  const vendors = new Set(buyable.map((g) => g.vendor_id));
  const canDraft = brewery.role === "admin" || brewery.role === "warehouse";

  return (
    <>
      {E.hd("Planning", "material gaps from committed work")}
      {gaps.length === 0
        ? E.blank("Nothing short: every committed batch and packaging run is covered by on hand and open orders")
        : gaps.map((g) => {
            const sub = [
              `need ${fmt(g.required)} · on hand ${fmt(g.on_hand)} · on order ${fmt(g.on_order)} ${g.base_uom ?? ""}`,
              g.needed_by ? `needed by ${g.needed_by}` : null,
              g.vendor_name ? `${g.vendor_name}${g.lead_time_days !== null ? ` · ${g.lead_time_days} day lead · buy by ${g.buy_by}` : " · no lead time typed"}` : "no contract and no default vendor",
              g.out_of_reach ? "past the buy-by date · left out of the draft" : null,
            ].filter(Boolean).join(" · ");
            return <div key={g.material_id}>{E.row(g.material_name ?? g.material_id, sub, `${fmt(g.purchase_units_short)} ${g.purchase_uom ?? ""}`, g.vendor_id && !g.out_of_reach ? "" : "w")}</div>;
          })}
      {E.sp()}
      {canDraft && <DraftButton materialIds={buyable.map((g) => g.material_id)} vendorCount={vendors.size} />}
    </>
  );
}
