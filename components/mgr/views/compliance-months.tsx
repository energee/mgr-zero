// components/mgr/views/compliance-months.tsx — Compliance months list. Live
// slots month / registry / lot hrefs; inventory draws unlabeled navs.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ComplianceMonthsViewModel } from "@/lib/mgr/compliance-months-view";

export type { ComplianceMonthsViewModel };

export function ComplianceMonthsView({
  model,
  linkRows,
  navs,
}: {
  model: ComplianceMonthsViewModel;
  linkRows?: boolean;
  navs?: ReactNode;
}) {
  return (
    <>
      {E.hd("Compliance", "months")}
      {navs !== undefined
        ? navs
        : (
          <>
            {model.months.map((row) => (
              <Fragment key={row.key}>
                {E.nav(row.title, row.detail, row.tone ?? "", undefined, linkRows ? row.href : undefined)}
              </Fragment>
            ))}
            {E.nav(model.registry.title, model.registry.detail, "", undefined, linkRows ? model.registry.href : undefined)}
            {model.lots.length > 0 && E.ttl("Lot trace")}
            {model.lots.map((row) => (
              <Fragment key={row.key}>
                {E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
              </Fragment>
            ))}
          </>
        )}
    </>
  );
}
