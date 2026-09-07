// app/(app)/locations/[id]/bins/page.tsx — Location bins: list_bins for one
// location, Add/Edit via bin-form.tsx. Warehouse or admin.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { isUuid } from "@/lib/commands/context";
import { notFound } from "next/navigation";
import { BinForm } from "../../bin-form";

type LocationRow = { id: string; name: string };
type BinRow = { id: string; name: string };

export default async function LocationBinsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const location = ((await runCommand("list_locations", {}, ctx)) as LocationRow[]).find((l) => l.id === id);
  if (!location) notFound();
  const bins = (await runCommand("list_bins", { locationId: id }, ctx)) as BinRow[];
  const canWrite = brewery.role === "admin" || brewery.role === "warehouse";
  return (
    <>
      {E.back(location.name, "Bins", canWrite ? <BinForm locationId={id} /> : undefined, `/locations/${id}`)}
      {bins.map((b) => (
        <div key={b.id}>{E.row(b.name, "", canWrite ? <BinForm locationId={id} bin={b} /> : undefined)}</div>
      ))}
    </>
  );
}
