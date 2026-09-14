// components/mgr/views/keg-report.tsx — Keg report: utilization, unreturned
// kegs by age with deposits at risk, and who to follow up with. Inventory
// renders the fixture; live renders get_keg_report through the same adapter.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { KegReportViewModel } from "@/lib/mgr/keg-report-view";

export type { KegReportViewModel };

export function KegReportView({ model }: { model: KegReportViewModel }) {
  return (
    <>
      {E.back("Keg fleet", "Keg report", undefined, model.backHref)}
      {E.num(model.headline[0], model.headline[1])}
      {model.empty ? E.blank(model.empty) : (
        <>
          {E.tbl(["Age", "Kegs", "Deposits"], model.aging)}
          {model.customers.map((c) => (
            <Fragment key={c.key}>{E.row(c.title, c.detail, E.act("Open balance", "primary", model.backHref === undefined ? undefined : c.href), c.detail.startsWith("none") ? "" : "w")}</Fragment>
          ))}
          {model.sizes.map((s) => <Fragment key={s.key}>{E.row(s.title, s.detail, s.trailing)}</Fragment>)}
        </>
      )}
    </>
  );
}
