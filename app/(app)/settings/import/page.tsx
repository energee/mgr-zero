import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { deniedHref } from "@/lib/mgr/denied";
import type { ImportLookups } from "@/lib/import-csv";
import "@/lib/commands/all";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  const brewery = await getActiveBrewery();
  if (brewery.role !== "admin") redirect(deniedHref("Import", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const queries = { channels: "list_sale_channels", customers: "list_customers", formats: "list_formats", groups: "list_price_groups", skus: "list_skus", locations: "list_locations", bins: "list_bins" };
  const lookups = Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([key, name]) => [key, await runCommand(name, {}, ctx)]))) as ImportLookups;
  return <ImportWizard breweryId={brewery.id} lookups={lookups} />;
}
