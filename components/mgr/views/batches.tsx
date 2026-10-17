// components/mgr/views/batches.tsx — the Batches register. Each lifecycle group
// is a table from md up and an unboxed list on the phone; vessel setup is one
// table below them. Adapters supply the rows and every destination.
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import { Item, ItemContent, ItemGroup, ItemHeader, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BatchesRowView, BatchesViewModel, BatchOccupancyView, BatchVesselView } from "@/lib/mgr/batches-view";

export type { BatchesViewModel };

/** A row's one identity link: the batch number or the vessel name. A fixture
 *  passes no href and gets an inert "#", as E.link does; `to` names the screen
 *  the explorer opens, since the copy is a record, not a screen name.
 *  Coarse pointers retain the shared 48px control target. */
const RecordLink = ({ href, to, children }: { href?: string; to: string; children: ReactNode }) => (
  <Link href={href ?? "#"} data-to={to} className="inline-flex min-h-6 items-center font-medium underline underline-offset-4 pointer-coarse:min-h-12">{children}</Link>
);

/** A brand or recipe the plan does not name, said in muted words instead of a blank. */
const orMissing = (value: string | null, missing: string) => value ?? <span className="text-muted-foreground">{missing}</span>;

/** Where a brewed batch is: one line per open occupancy with its latest reading
 *  and its own Reading action, or "No open occupancy". */
function Occupancies({ readings }: { readings: BatchOccupancyView[] }) {
  return readings.length ? (
    <ul className="grid gap-1">
      {readings.map(occupancy => <li key={occupancy.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 break-words"><span className="font-medium">{occupancy.vessel}</span> · {occupancy.reading}</span>
        {E.act("Reading", "info", occupancy.href)}
      </li>)}
    </ul>
  ) : <span className="text-muted-foreground">No open occupancy</span>;
}

/** One lifecycle group from md up. A batch with readings lists its open
 *  occupancies in the vessel cell; any other batch shows the vessel names it
 *  has. A group where no batch has either draws no vessel column at all. */
function GroupTable({ rows }: { rows: BatchesRowView[] }) {
  const brew = rows.some(row => row.brewable);
  const vesselHead = rows.some(row => row.readings) ? "Vessel and latest reading" : rows.some(row => row.vessel) ? "Vessel" : null;
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Recipe</TableHead>
            <TableHead>Planned on</TableHead>
            <TableHead className="text-right">Planned barrels</TableHead>
            {vesselHead && <TableHead>{vesselHead}</TableHead>}
            {brew && <TableHead><span className="sr-only">Action</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => <TableRow key={row.key} className="[&>td]:align-baseline">
            <TableCell><RecordLink href={row.href} to="Brew day">{row.batchNo}</RecordLink></TableCell>
            <TableCell className="whitespace-normal">{orMissing(row.brand, "No brand yet")}</TableCell>
            <TableCell className="whitespace-normal">{orMissing(row.recipe, "No recipe")}</TableCell>
            <TableCell>{row.plannedOn}</TableCell>
            <TableCell className="text-right">{row.plannedBbl}</TableCell>
            {vesselHead && <TableCell className="whitespace-normal">{row.readings ? <Occupancies readings={row.readings} /> : row.vessel}</TableCell>}
            {brew && <TableCell className="text-right">{row.brewable && E.act("Brew", "info", row.href)}</TableCell>}
          </TableRow>)}
        </TableBody>
      </Table>
    </div>
  );
}

/** The same group on the phone: each batch's facts labeled, its open occupancies under a rule. */
function GroupList({ rows }: { rows: BatchesRowView[] }) {
  return (
    <ItemGroup className="gap-0 md:hidden">
      {rows.map((row, index) => <Fragment key={row.key}>
        {index > 0 && <ItemSeparator />}
        <Item role="listitem" className="px-0">
          <ItemHeader>
            <ItemTitle><RecordLink href={row.href} to="Brew day">{row.batchNo}</RecordLink></ItemTitle>
            {row.brewable && E.act("Brew", "info", row.href)}
          </ItemHeader>
          <ItemContent className="gap-0">
            {E.fld("Brand", orMissing(row.brand, "No brand yet"))}
            {E.fld("Recipe", orMissing(row.recipe, "No recipe"))}
            {E.fld("Planned on", row.plannedOn)}
            {E.fld("Planned barrels", row.plannedBbl)}
            {row.readings ? <><ItemSeparator /><Occupancies readings={row.readings} /></> : row.vessel && E.fld("Vessel", row.vessel)}
          </ItemContent>
        </Item>
      </Fragment>)}
    </ItemGroup>
  );
}

/** Vessel setup: the name opens its edit page, and inactive is said in words. */
function VesselTable({ vessels }: { vessels: BatchVesselView[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vessel</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead className="text-right">Capacity (bbl)</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vessels.map(vessel => <TableRow key={vessel.key}>
          <TableCell><RecordLink href={vessel.href} to="Vessel detail">{vessel.name}</RecordLink></TableCell>
          <TableCell>{vessel.kind}</TableCell>
          <TableCell className="text-right">{vessel.capacityBbl}</TableCell>
          <TableCell>{vessel.active ? "Active" : "Inactive"}</TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
  );
}

export function BatchesView({ model, createAction, workHrefs, newVesselHref }: {
  model: BatchesViewModel; createAction?: ReactNode; workHrefs?: Record<string, string>; newVesselHref?: string;
}) {
  const names = workHrefs ? model.workChips.filter(name => workHrefs[name]) : model.workChips;
  return <>
    {E.hd(model.title, "", createAction !== undefined ? createAction : E.btn("New batch"))}
    <TabBar names={names} on={names.indexOf(model.workChips[model.workChipIndex])} cls="w-full overflow-x-auto" to={model.workTabs} hrefs={workHrefs} />
    {model.empty ? E.blank(model.empty) : <>
      {([["Planned", model.planned], ["Active", model.active], ["Completed", model.completed ?? []], ["Cancelled", model.cancelled ?? []]] as const).map(([title, rows]) => {
        return rows.length ? <Fragment key={title}>
          {E.ttl(title)}
          <GroupTable rows={rows} />
          <GroupList rows={rows} />
        </Fragment> : null;
      })}
    </>}
    {model.vessels !== undefined && <>
      {E.ttl("Vessels")}
      <div className="self-start">{E.btn("New vessel", "p", newVesselHref)}</div>
      {!model.vessels.length ? E.blank("No vessels yet") : <VesselTable vessels={model.vessels} />}
    </>}
  </>;
}
