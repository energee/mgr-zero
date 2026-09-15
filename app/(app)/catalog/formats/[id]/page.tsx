import { E } from "@/components/mgr/e";
import { PackageBomView } from "@/components/mgr/views/package-bom";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import { toPackageBomViewProps } from "@/lib/mgr/package-bom-view";
import { canComposeFormat, eligibleChildren } from "@/lib/format-edit-rules";
import "@/lib/commands/all";
import { FormatForm } from "../../format-form";
import { formatVolume } from "@/lib/volume";
import type { FormatSnapshot } from "@/lib/mgr/format-view";
import { PourForm } from "../../pour-form";
import { FormatRowsForm } from "./rows-form";
import { DeleteCommandButton } from "../../../delete-command-button";
import { DeleteFormatControl } from "@/components/mgr/views/delete-format";

type Detail = {
  format: { brand_id: string | null; brands: { name: string } | null; ounces: number | null; id: string; name: string; basis: "packaged" | "poured"; bbl_per_unit: string | null; package_type: string | null; keg_size: string | null; units_per_case: number | null };
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
  if (data.format.basis === "poured") {
    const f = data.format;
    return <>{E.back("Catalog", `${f.brands?.name} · ${f.name}`, writable ? <PourForm key={`${f.id}-${f.name}-${f.ounces}`} brand={{ id: f.brand_id!, name: f.brands!.name }} pour={{ id: f.id, name: f.name, ounces: f.ounces! }} /> : undefined, "/catalog")}{E.info(`${f.ounces} oz · poured · never held as stock`)}</>;
  }
  const children = eligibleChildren(id, data.formats);
  const volume = data.formats.find(format => format.id === id)?.bbl_per_unit;
  const components = data.components.map((c) => ({ id: c.child_format_id, qty: String(c.qty) }));
  const lines = data.lines.map((l) => ({ id: l.material_id, qty: String(l.qty_per_unit), onBreak: l.on_break }));
  const materialOptions = data.materials.map(m => ({ id: m.id, name: `${m.name} (${m.base_uom})${m.active ? "" : " · inactive"}` }));
  const bomModel = toPackageBomViewProps({
    format: data.format,
    lines: data.lines.map((line) => ({
      material: data.materials.find((material) => material.id === line.material_id) ?? null,
      qty_per_unit: line.qty_per_unit,
      on_break: line.on_break,
    })),
  });
  const composable = canComposeFormat(data.format, data.usedAsChild);
  return <>
    {E.back("Catalog", data.format.name, writable ? <FormatForm key={JSON.stringify(data.format)} format={{ ...data.format, composed: components.length > 0 } satisfies FormatSnapshot["format"]}
      deleteAction={ctx.role === "admin" ? <DeleteCommandButton control={DeleteFormatControl} command="delete_format" input={{ formatId: id }} name={data.format.name} redirect="/catalog" /> : null}
      canCompose={components.length === 0 && composable}
      materials={<FormatRowsForm key={JSON.stringify(lines)} formatId={id} kind="bom" initial={lines} options={materialOptions} />}
      contents={composable ? <section className="pt-3"><h3 className="text-sm font-medium">Package contents</h3><div className="pt-3"><FormatRowsForm key={JSON.stringify(components)} formatId={id} kind="components" initial={components} options={children} /></div></section> : undefined}
    /> : undefined, "/catalog")}
    <p className="text-sm text-muted-foreground">Shared format · {volume == null ? "No beer volume yet — add package contents" : `${formatVolume(volume)} of beer per package`}</p>
    {composable || components.length > 0 ? <section className="flex flex-col gap-3 border-t pt-5">
      {E.hd("Package contents", "Smaller packages inside this one, such as six four-packs in a case · managed in Edit format")}
      {components.length ? E.tbl(["Package", "Quantity"], components.map((c) => [data.formats.find((f) => f.id === c.id)?.name ?? c.id, c.qty])) : E.blank("Add the packages inside to calculate the total volume")}
    </section> : null}
    <PackageBomView
      model={bomModel}
      createAction={E.hd("Packaging materials", "Optional · managed in Edit format")}
      rowAction={null}
      footer={null}
    />
    {!writable ? E.info("Admin or Sales can replace components and packaging materials.") : null}
  </>;
}
