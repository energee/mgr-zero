// app/(app)/planning/page.tsx — More › Planning: material gaps
// (get_material_requirements): what committed batches and packaging runs
// need, less on hand and open POs, resolved to a vendor. Buy-by is needed-by
// less the vendor's typed lead time; a gap past its buy-by is out of reach
// and is left out of the draft. Draft is draft-button.tsx (admin/warehouse).
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { DraftButton } from "./draft-button";

type Gap = {
  material_id: string; material_name: string | null; base_uom: string | null; purchase_uom: string | null;
  required: number; on_hand: number; on_order: number; short: number; purchase_units_short: number; needed_by: string | null;
  vendor_id: string | null; vendor_name: string | null; lead_time_days: number | null;
};

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export default async function PlanningPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const gaps = ((await runCommand("get_material_requirements", {}, ctx)) as Gap[]).filter((g) => g.short > 0);
  const today = new Date().toISOString().slice(0, 10);
  const buyBy = (g: Gap) => (g.needed_by && g.lead_time_days !== null ? addDays(g.needed_by, -g.lead_time_days) : null);
  const reach = (g: Gap): "no vendor" | "out of reach" | "buyable" => (!g.vendor_id ? "no vendor" : (buyBy(g) ?? today) < today ? "out of reach" : "buyable");
  const buyable = gaps.filter((g) => reach(g) === "buyable");
  const vendors = new Set(buyable.map((g) => g.vendor_id));
  const canDraft = brewery.role === "admin" || brewery.role === "warehouse";

  return (
    <>
      {E.hd("Planning", "material gaps from committed work")}
      {gaps.length === 0
        ? E.blank("Nothing short: every committed batch and packaging run is covered by on hand and open orders")
        : gaps.map((g) => {
            const r = reach(g);
            const sub = [
              `need ${fmt(g.required)} · on hand ${fmt(g.on_hand)} · on order ${fmt(g.on_order)} ${g.base_uom ?? ""}`,
              g.needed_by ? `needed by ${g.needed_by}` : null,
              g.vendor_name ? `${g.vendor_name}${g.lead_time_days !== null ? ` · ${g.lead_time_days} day lead · buy by ${buyBy(g)}` : " · no lead time typed"}` : "no contract and no default vendor",
              r === "out of reach" ? "past the buy-by date · left out of the draft" : null,
            ].filter(Boolean).join(" · ");
            return <div key={g.material_id}>{E.row(g.material_name ?? g.material_id, sub, `${fmt(g.purchase_units_short)} ${g.purchase_uom ?? ""}`, r === "buyable" ? "" : "w")}</div>;
          })}
      {E.sp()}
      {canDraft && <DraftButton materialIds={buyable.map((g) => g.material_id)} vendorCount={vendors.size} />}
    </>
  );
}
