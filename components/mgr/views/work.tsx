// Shared Work filters, standalone-task navigation, and rows; the live adapter owns device persistence.
"use client";
import { Fragment, useState, type ReactNode } from "react";
import { DeliveryTruck01Icon, Package01Icon, Route01Icon, ThermometerIcon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import { filterWorkRows, WORK_LABELS, workEmpty, type WorkViewModel } from "@/lib/mgr/work-view";

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
  const names = [...model.workChips, ...Object.keys(model.workHrefs)];
  function changeChip(value: string) {
    if (!model.workChips.includes(value)) return;
    (onChip ?? setLocalChip)(value);
  }
  const newOrder = createAction !== undefined ? createAction : E.btn("New order", "g");
  const emptyAction = model.rows.length === 0 && (selected === "all" || selected === "orders") ? newOrder : undefined;
  const list = rows.length === 0 ? E.blank(workEmpty(selected), undefined, emptyAction) : rows.map(row => <Fragment key={row.key}>
    {E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href), row.warning ? "w" : "", row.icon ? ICON[row.icon] : undefined)}
  </Fragment>);
  return (
    <>
      {E.hd("Work", undefined, newOrder)}
      {/* Only filter chips control row panels; standalone task chips navigate
          through the same TabBar without changing the selected filter. */}
      <div data-work-filter className="flex flex-1 flex-col">
        <TabBar names={names} on={model.workChips.indexOf(selected)} cls="w-full overflow-x-auto justify-start scroll-cue" to={model.workTabs} hrefs={model.workHrefs} labels={WORK_LABELS} onChange={changeChip} label="Filter work" panel={list} />
      </div>
    </>
  );
}
