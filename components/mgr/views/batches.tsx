// components/mgr/views/batches.tsx — the Batches register. Each lifecycle group
// and the vessel setup list are drawn by the shared RecordTable: a table from
// md up and an unboxed list on the phone. Adapters supply the rows and every
// destination; a fixture row has no href, so its name is an inert tap.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import { RecordTable } from "@/components/mgr/views/record-table";
import type { BatchesRowView, BatchesViewModel, BatchOccupancyView, BatchVesselView } from "@/lib/mgr/batches-view";

export type { BatchesViewModel };

/** A brand or recipe the plan does not name, said in muted words instead of a blank. */
const orMissing = (value: string | null, missing: string) => value ?? <span className="text-muted-foreground">{missing}</span>;

/** Where a brewed batch is: one line per open occupancy with its latest reading
 *  and its own Reading action, or "No open occupancy". */
function Occupancies({ readings }: { readings: BatchOccupancyView[] }) {
  return readings.length ? (
    <ul className="grid gap-1">
      {readings.map(occupancy => <li key={occupancy.key} className="flex items-center justify-between gap-3">
        {/* The text wraps in its own space, so Reading always sits at the line's right end. */}
        <span className="min-w-0 flex-1 break-words"><span className="font-medium">{occupancy.vessel}</span> · {occupancy.reading}</span>
        <span className="shrink-0">{E.act("Reading", "info", occupancy.href)}</span>
      </li>)}
    </ul>
  ) : <span className="text-muted-foreground">No open occupancy</span>;
}

/** One lifecycle group. A batch with readings lists its open occupancies in
 *  the vessel cell; any other batch shows the vessel names it has. A group
 *  where no batch has either draws no vessel column at all, and one with no
 *  plannable batch draws no Brew column. */
function GroupTable({ rows }: { rows: BatchesRowView[] }) {
  const brew = rows.some(row => row.brewable);
  const vesselHead = rows.some(row => row.readings) ? "Vessel and latest reading" : rows.some(row => row.vessel) ? "Vessel" : null;
  return <RecordTable
    headers={["Batch", "Brand", "Recipe", "Planned on", "Planned barrels", ...(vesselHead ? [vesselHead] : []), ...(brew ? [<span key="action" className="sr-only">Action</span>] : [])]}
    align={["l", "l", "l", "l", "r", ...(vesselHead ? ["l" as const] : []), ...(brew ? ["r" as const] : [])]}
    rows={rows.map(row => ({
      key: row.key,
      href: row.href,
      to: "Brew day",
      cells: [
        row.batchNo,
        orMissing(row.brand, "No brand yet"),
        orMissing(row.recipe, "No recipe"),
        row.plannedOn,
        row.plannedBbl,
        ...(vesselHead ? [row.readings ? <Occupancies key="vessel" readings={row.readings} /> : row.vessel] : []),
        ...(brew ? [row.brewable && E.act("Brew", "info", row.href)] : []),
      ],
    }))}
  />;
}

/** Vessel setup: the name opens its edit page, and inactive is said in words. */
function VesselTable({ vessels }: { vessels: BatchVesselView[] }) {
  return <RecordTable
    headers={["Vessel", "Kind", "Capacity (bbl)", "Status"]}
    align={["l", "l", "r", "l"]}
    rows={vessels.map(vessel => ({
      key: vessel.key,
      href: vessel.href,
      to: "Vessel detail",
      cells: [vessel.name, vessel.kind, vessel.capacityBbl, vessel.active ? "Active" : "Inactive"],
    }))}
  />;
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
