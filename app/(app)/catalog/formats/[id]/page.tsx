import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import { canComposeFormat, eligibleChildren } from "@/lib/format-edit-rules";
import "@/lib/commands/all";
import { FormatRowsForm } from "./rows-form";

type Detail = {
  format: { id: string; name: string; basis: string; bbl_per_unit: string | null };
  components: { child_format_id: string; qty: number }[];
  lines: { material_id: string; qty_per_unit: number; on_break: "consumed" | "return_to_stock" }[];
  formats: { id: string; name: string; basis: string; bbl_per_unit: string | null; composed: boolean }[];
  materials: { id: string; name: string; base_uom: string; active: boolean }[];
  usedAsChild: boolean;
};

export default async function FormatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const data = await orNotFound(runCommand("get_format_composition", { formatId: id }, ctx)) as Detail;
  const writable = ctx.role === "admin" || ctx.role === "sales";
  const children = eligibleChildren(id, data.formats);
  const components = data.components.map((c) => ({ id: c.child_format_id, qty: String(c.qty) }));
  const lines = data.lines.map((l) => ({ id: l.material_id, qty: String(l.qty_per_unit), onBreak: l.on_break }));
  return <>
    {E.back("Catalog", data.format.name, undefined, "/catalog")}
    {E.info(`${data.format.basis} · ${data.format.bbl_per_unit === null ? "Volume derives from components; without components this format cannot hold stock." : `${data.format.bbl_per_unit} bbl per unit`}`)}
    {E.hd("Components", "One level of atomic packaged formats", writable && canComposeFormat(data.format, data.usedAsChild) ? <FormatRowsForm key={JSON.stringify(components)} formatId={id} kind="components" initial={components} options={children} /> : undefined)}
    {components.length ? E.tbl(["Child format", "Quantity"], components.map((c) => [data.formats.find((f) => f.id === c.id)?.name ?? c.id, c.qty])) : E.blank("No components")}
    {!canComposeFormat(data.format, data.usedAsChild) ? E.info("Components require a packaged format without a typed volume that is not already used as another format's child. Create a separate format with BBL per unit blank to compose it.") : null}
    {E.hd("Package BOM", "Material quantities are in their base units", writable ? <FormatRowsForm key={JSON.stringify(lines)} formatId={id} kind="bom" initial={lines} options={data.materials.map((m) => ({ id: m.id, name: `${m.name} (${m.base_uom})${m.active ? "" : " · inactive"}` }))} /> : undefined)}
    {lines.length ? E.tbl(["Material", "Quantity", "On break"], lines.map((l) => [data.materials.find((m) => m.id === l.id)?.name ?? l.id, `${l.qty} ${data.materials.find((m) => m.id === l.id)?.base_uom ?? ""}`, l.onBreak.replaceAll("_", " ")])) : E.blank("No tracked packaging materials")}
    {!writable ? E.info("Admin or Sales can replace components and packaging materials.") : null}
  </>;
}
