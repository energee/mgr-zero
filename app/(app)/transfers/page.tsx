// app/(app)/transfers/page.tsx — Work › Transfers: stock transfers between
// two locations (list_stock_transfers), newest first, each opening its own
// page; New transfer is new-transfer-form.tsx → create_stock_transfer.
import { TransfersView } from "@/components/mgr/views/transfers";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toTransfersViewProps } from "@/lib/mgr/transfers-view";
import "@/lib/commands/all";
import { NewTransferForm } from "./new-transfer-form";

type Transfer = { id: string; transfer_no: number | null; status: string; from_location_id: string; to_location_id: string; stock_transfer_lines: { id: string }[] };
type Location = { id: string; name: string; kind: string };
type Bin = { id: string; location_id: string; name: string };
type Sku = { id: string; name: string; brands: { name: string } | null };

export default async function TransfersPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [transfers, locations, bins, skus] = (await Promise.all([
    runCommand("list_stock_transfers", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx), runCommand("list_skus", {}, ctx),
  ])) as [Transfer[], Location[], Bin[], Sku[]];
  const locationById = new Map(locations.map((l) => [l.id, l.name]));
  const locName = (id: string) => locationById.get(id) ?? "—";
  return (
    <TransfersView
      model={toTransfersViewProps({
        title: "Transfers",
        transfers: transfers.map((t) => ({
          id: t.id,
          transfer_no: t.transfer_no,
          status: t.status,
          from_name: locName(t.from_location_id),
          to_name: locName(t.to_location_id),
          line_count: t.stock_transfer_lines.length,
        })),
      })}
      createAction={<NewTransferForm locations={locations} bins={bins} skus={skus.map((s) => ({ id: s.id, label: s.brands ? `${s.brands.name} — ${s.name}` : s.name }))} />}
      tabs={null}
      linkRows
    />
  );
}
