// Shared Transfers list; adapters supply actions and explicit destinations.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import type { TransfersViewModel } from "@/lib/mgr/transfers-view";

export type { TransfersViewModel };

export function TransfersView({
  model,
  createAction,
  workHrefs,
  linkRows,
}: {
  model: TransfersViewModel;
  createAction?: ReactNode;
  workHrefs?: Record<string, string>;
  /** Live: verbs are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
}) {
  const names = workHrefs ? model.workChips.filter(name => workHrefs[name]) : model.workChips;
  return (
    <>
      {E.hd(model.title, "between locations", createAction !== undefined ? createAction : E.btn("New transfer"))}
      <TabBar names={names} on={names.indexOf(model.workChips[model.workChipIndex])} cls="w-full overflow-x-auto" to={model.workTabs} hrefs={workHrefs} />
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined), row.warning ? "w" : "")}
          </Fragment>
        ))}
    </>
  );
}
