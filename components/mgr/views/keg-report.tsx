// components/mgr/views/keg-report.tsx — Keg report: utilization, unreturned
// kegs by age with deposits at risk, who to follow up with, and whose
// deposit count disagrees with their kegs out (#577). Inventory
// and live both render a KegReport through toKegReportViewProps.
import { E } from "@/components/mgr/e";
import type { KegReportViewModel } from "@/lib/mgr/keg-report-view";

export type { KegReportViewModel };

export function KegReportView({ model }: { model: KegReportViewModel }) {
  return (
    <>
      {E.back("Keg fleet", "Keg report", undefined, model.backHref)}
      {model.empty ? E.blank(model.empty) : (
        <>
          {E.num(model.headline[0], model.headline[1])}
          {E.tbl(["Age", "Kegs", "Deposits"], model.aging)}
          {model.customers.map((c) => <div key={c.key}>{E.row(c.title, c.detail, E.act("Open balance", "primary", c.href), c.overdue ? "w" : "")}</div>)}
          {model.mismatches.length > 0 && E.ttl("Deposit mismatches")}
          {model.mismatches.map((m) => <div key={m.key}>{E.row(m.title, m.detail, E.act("Open balance", "primary", m.href), "w")}</div>)}
          {model.sizes.map((s) => <div key={s.key}>{E.row(s.title, s.detail, s.trailing)}</div>)}
        </>
      )}
    </>
  );
}
