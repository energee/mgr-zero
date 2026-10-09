// Shared Work filters and rows; the live adapter owns device persistence.
"use client";
import { Fragment, useState, type ReactNode } from "react";
import { DeliveryTruck01Icon, Package01Icon, Route01Icon, ThermometerIcon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import { filterWorkRows, type WorkViewModel } from "@/lib/mgr/work-view";

export type { WorkViewModel };

const ICON = { package: Package01Icon, truck: DeliveryTruck01Icon, route: Route01Icon, thermometer: ThermometerIcon };

export function WorkView({
  model,
  createAction,
  chip,
  onChip,
}: {
  model: WorkViewModel;
  createAction?: ReactNode;
  chip?: string;
  onChip?: (value: string) => void;
}) {
  const [localChip, setLocalChip] = useState(model.workChips[model.workChipIndex]);
  // A chip the bar does not offer (a stale remembered choice) shows the first
  // chip instead, so the rows never vanish behind an unselected tab.
  const wanted = chip ?? localChip;
  const selected = model.workChips.includes(wanted) ? wanted : model.workChips[0];
  const rows = filterWorkRows(model, selected);
  const list = rows.length === 0 ? E.blank("Nothing in motion") : rows.map(row => <Fragment key={row.key}>
    {E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href), row.warning ? "w" : "", row.icon ? ICON[row.icon] : undefined)}
  </Fragment>);
  return (
    <>
      {E.hd("Work", model.subtitle, createAction !== undefined ? createAction : E.btn("New order", "g"))}
      {/* The rows are the selected tab's panel: see TabBar's `panel` (#727). */}
      <div data-work-filter className="flex flex-1 flex-col">
        <TabBar names={model.workChips} on={model.workChips.indexOf(selected)} cls="w-full overflow-x-auto" to={model.workTabs} onChange={onChip ?? setLocalChip} label="Filter work" panel={list} />
      </div>
    </>
  );
}
