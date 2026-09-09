// components/mgr/views/keg-history.tsx — Keg event history. Live slots filter
// chips; inventory draws Customer / Keg pool picks.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { KegHistoryViewModel } from "@/lib/mgr/keg-history-view";

export type { KegHistoryViewModel };

export function KegHistoryView({
  model,
  filters,
}: {
  model: KegHistoryViewModel;
  filters?: ReactNode;
}) {
  return (
    <>
      {E.back("Keg fleet", "Keg event history", undefined, model.backHref)}
      {filters ?? (
        <>
          {E.pick("Customer", model.customer, model.customerOptions)}
          {E.pick("Keg pool", model.pool, model.poolOptions)}
        </>
      )}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, row.who ?? "", row.warning ? "w" : row.ok ? "ok" : "")}
          </Fragment>
        ))}
    </>
  );
}
