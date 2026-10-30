// components/mgr/views/keg-history.tsx — Keg event history: the keg ledger
// newest first, scoped by the Keg pool and Customer picks (ScopePick, so the
// URL holds the scope). Inventory and the live page draw the same controls.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import { ScopePick } from "@/components/mgr/scope-pick";
import type { KegHistoryViewModel } from "@/lib/mgr/keg-history-view";

export function KegHistoryView({ model }: { model: KegHistoryViewModel }) {
  return (
    <>
      {E.back("Keg fleet", "Keg event history", undefined, model.backHref)}
      {E.cols(
        <ScopePick label="Keg pool" value={model.pool} options={model.poolOptions} />,
        <ScopePick label="Customer" value={model.customer} options={model.customerOptions} search />,
      )}
      {model.empty
        ? E.blank(model.empty, undefined, model.empty.action && E.btn(model.empty.action, "p", model.empty.href))
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, "", row.warning ? "w" : row.ok ? "ok" : "")}
          </Fragment>
        ))}
    </>
  );
}
