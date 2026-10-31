// components/mgr/views/batches.tsx — the Batches register. Each lifecycle group
// and the vessel setup list are drawn by the shared RecordTable: a table from
// md up and an unboxed list on the phone. Adapters supply the rows and every
// destination; a fixture row has no href, so its name is an inert tap.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RecordTable } from "@/components/mgr/views/record-table";
import type { BatchesRowView, BatchesViewModel, BatchOccupancyView, BatchVesselView } from "@/lib/mgr/batches-view";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";

/** A brand or recipe the plan does not name, said in muted words instead of a blank. */
const orMissing = (value: string | null, missing: string) => value ?? <span key={missing} className="text-muted-foreground">{missing}</span>;

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
 *  where no batch has either draws no vessel column at all. The row itself
 *  is the link that opens the batch; an overdue plan's date is badged, the date last so
 *  it never breaks (as on Invoices). */
function GroupTable({ rows }: { rows: BatchesRowView[] }) {
  const vesselHead = rows.some(row => row.readings) ? "Vessel and latest reading" : rows.some(row => row.vessel) ? "Vessel" : null;
  return <RecordTable
    headers={["Batch", "Brand", "Recipe", "Planned on", "Planned barrels", ...(vesselHead ? [vesselHead] : [])]}
    align={["l", "l", "l", "l", "r", ...(vesselHead ? ["l" as const] : [])]}
    rows={rows.map(row => ({
      key: row.key,
      href: row.href,
      to: "Brew day",
      cells: [
        row.batchNo,
        orMissing(row.brand, "No brand yet"),
        orMissing(row.recipe, "No recipe"),
        row.overdue ? <Fragment key="planned">{E.status("Overdue", "w")} {row.plannedOn}</Fragment> : row.plannedOn,
        row.plannedBbl,
        ...(vesselHead ? [row.readings ? <Occupancies key="vessel" readings={row.readings} /> : row.vessel] : []),
      ],
      // A missing brand or recipe sorts last rather than by its muted words;
      // readings sort by their vessels.
      sort: [
        row.batchNo,
        row.brand,
        row.recipe,
        row.plannedOn,
        row.plannedBbl,
        ...(vesselHead ? [row.readings ? row.readings.map(occupancy => occupancy.vessel).join(", ") || null : row.vessel] : []),
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
  model: BatchesViewModel; createAction?: ReactNode; workHrefs?: Record<string, string>;
  /** null hides New vessel: vessels are admin-managed. */
  newVesselHref?: string | null;
}) {
  return <>
    {E.hd(model.title, "", createAction !== undefined ? createAction : E.btn("New batch"))}
    <WorkKindTabs chips={model.workChips} current={model.workChips[model.workChipIndex]} tabs={model.workTabs} hrefs={workHrefs} />
    {model.empty ? E.blank(model.empty) : <>
      {([["Planned", model.planned], ["Active", model.active], ["Completed", model.completed ?? []]] as const).map(([title, rows]) => {
        return rows.length ? <Fragment key={title}>
          {E.ttl(title)}
          <GroupTable rows={rows} />
        </Fragment> : null;
      })}
      {!!model.cancelled?.length && <details className="rounded border p-3">
        <summary className="cursor-pointer text-sm font-medium">Cancelled ({model.cancelled.length})</summary>
        <div className="mt-3"><GroupTable rows={model.cancelled} /></div>
      </details>}
    </>}
    {model.vessels !== undefined && <section aria-label="Vessel setup" className="flex min-w-0 flex-col gap-3">
      {E.ttl("Vessels")}
      <p className="text-sm text-muted-foreground">Set up the tanks and other vessels used for brewing and cellar work.</p>
      {newVesselHref !== null && <div className="self-start">{E.btn("New vessel", "g", newVesselHref)}</div>}
      {!model.vessels.length ? <p className="text-sm text-muted-foreground">No vessels yet</p> : <VesselTable vessels={model.vessels} />}
    </section>}
  </>;
}
