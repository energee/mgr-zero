// app/(app)/cellar/page.tsx — Beer › Cellar: tanks with beer in them right
// now (list_occupancies), each opening its reading log; Transfer is
// cellar-transfer-form.tsx → record_cellar_transfer.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { CellarTransferForm } from "./cellar-transfer-form";

type Occupancy = {
  occupancy_id: string; vessel_id: string; vessel_name: string | null; batch_id: string; batch_no: number | null;
  brand_name: string | null; started_at: string; bbl: number;
};
type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };

export default async function CellarPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [occupancies, vessels] = (await Promise.all([
    runCommand("list_occupancies", {}, ctx), runCommand("list_vessels", {}, ctx),
  ])) as [Occupancy[], Vessel[]];

  return (
    <>
      {E.hd("Cellar", "occupied tanks", <CellarTransferForm occupancies={occupancies} vessels={vessels} />)}
      {occupancies.length === 0
        ? E.blank("No tanks occupied")
        : occupancies.map((o) => (
            <div key={o.occupancy_id}>
              {E.row(
                o.vessel_name ?? "—",
                `${o.brand_name ?? "no brand yet"} · ${Number(o.bbl)} bbl · since ${o.started_at.slice(0, 10)}`,
                E.act("Reading", "info", `/cellar/${o.occupancy_id}/reading`),
              )}
            </div>
          ))}
    </>
  );
}
