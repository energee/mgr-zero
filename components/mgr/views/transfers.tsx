// Shared Transfers list; adapters supply actions and explicit destinations.
import { Fragment, type ReactNode } from "react";
import { E, ROW_LINK_COVER } from "@/components/mgr/e";
import type { TransfersViewModel } from "@/lib/mgr/transfers-view";
import { WorkKindTabs } from "@/components/mgr/views/work-kind-tabs";

export function TransfersView({
  model,
  createAction,
  workHrefs,
  linkRows,
}: {
  model: TransfersViewModel;
  createAction?: ReactNode;
  workHrefs?: Record<string, string>;
  /** Live: verbs and verb-less rows are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd(model.title, "between locations", createAction !== undefined ? createAction : E.btn("New transfer"))}
      <WorkKindTabs chips={model.workChips} current={model.workChips[model.workChipIndex]} tabs={model.workTabs} hrefs={workHrefs} />
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {row.verb
              ? E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined, undefined, undefined, ROW_LINK_COVER), row.warning ? "w" : "")
              : E.nav(row.title, row.detail, row.warning ? "w" : "", undefined, linkRows ? row.href : undefined)}
          </Fragment>
        ))}
    </>
  );
}
