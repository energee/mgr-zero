// app/(app)/transfers/page.tsx — Work › Transfers: stock transfers between
// two locations (list_stock_transfers), newest first, each opening its own
// page; New transfer is new-transfer-form.tsx → create_stock_transfer.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { NewTransferForm } from "./new-transfer-form";
import { trfNo } from "./trf-no";

type Transfer = { id: string; transfer_no: number | null; status: string; from_location_id: string; to_location_id: string; stock_transfer_lines: { id: string }[] };
type Location = { id: string; name: string; kind: string };
type Bin = { id: string; location_id: string; name: string };
type Sku = { id: string; name: string; products: { name: string } | null };

const VERB: Record<string, [string, "info" | "attention" | "success"]> = {
  draft: ["Submit", "info"], submitted: ["Pick", "info"], picked: ["Receive", "success"], in_transit: ["Receive", "success"],
};

export default async function TransfersPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [transfers, locations, bins, skus] = (await Promise.all([
    runCommand("list_stock_transfers", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx), runCommand("list_skus", {}, ctx),
  ])) as [Transfer[], Location[], Bin[], Sku[]];
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? "—";
  return (
    <>
      {E.hd("Transfers", "between locations", <NewTransferForm locations={locations} bins={bins} skus={skus.map((s) => ({ id: s.id, label: s.products ? `${s.products.name} — ${s.name}` : s.name }))} />)}
      {transfers.length === 0
        ? E.blank("No transfers yet")
        : transfers.map((t) => {
            const verb = VERB[t.status];
            return (
              <div key={t.id}>
                {E.row(trfNo(t.transfer_no), `${locName(t.from_location_id)} → ${locName(t.to_location_id)} · ${t.stock_transfer_lines.length} line${t.stock_transfer_lines.length === 1 ? "" : "s"} · ${t.status.replace("_", " ")}`,
                  verb ? E.act(verb[0], verb[1], `/transfers/${t.id}`) : E.act("Open", "primary", `/transfers/${t.id}`), t.status === "received" || t.status === "cancelled" ? "" : "w")}
              </div>
            );
          })}
    </>
  );
}
