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
  const selected = chip ?? localChip;
  const rows = filterWorkRows(model, selected);
  return (
    <>
      {E.hd("Work", model.subtitle, createAction !== undefined ? createAction : E.btn("New order", "g"))}
      <div data-work-filter>
        <TabBar names={model.workChips} on={model.workChips.indexOf(selected)} cls="w-full overflow-x-auto" to={model.workTabs} onChange={onChip ?? setLocalChip} />
      </div>
      {rows.length === 0 ? E.blank("Nothing in motion") : rows.map(row => <Fragment key={row.key}>
        {E.row(row.title, row.detail, E.act(row.verb, row.tone, row.href), row.warning ? "w" : "", row.icon ? ICON[row.icon] : undefined)}
      </Fragment>)}
    </>
  );
}
