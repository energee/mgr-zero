// components/mgr/views/keg-report.tsx — Keg report: utilization, unreturned
// kegs by age with deposits at risk, who to follow up with, and whose
// deposit count disagrees with their kegs out (#577). Inventory
// and live both render a KegReport through toKegReportViewProps.
import { E } from "@/components/mgr/e";
import type { KegReportViewModel } from "@/lib/mgr/keg-report-view";

export function KegReportView({ model }: { model: KegReportViewModel }) {
  return (
    <>
      {E.back("Keg fleet", "Keg report", undefined, model.backHref)}
      {model.empty ? E.blank(model.empty, undefined, E.btn(model.empty.action, "p", model.empty.href)) : (
        <>
          {E.num(model.headline[0], model.headline[1])}
          {E.tbl(["Age", "Kegs", "Deposits"], model.aging, ["l", "r", "r"])}
          {model.customers.map((c) => <div key={c.key}>{E.nav(c.title, c.detail, c.overdue ? "w" : "", undefined, c.href)}</div>)}
          {model.mismatches.length > 0 && E.ttl("Deposit mismatches")}
          {model.mismatches.map((m) => <div key={m.key}>{E.nav(m.title, m.detail, "w", undefined, m.href)}</div>)}
          {model.sizes.map((s) => <div key={s.key}>{E.row(s.title, s.detail, s.trailing)}</div>)}
        </>
      )}
    </>
  );
}
