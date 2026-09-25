// components/mgr/views/compliance-months.tsx — Compliance months list: a
// Monthly / Quarterly / Annual tab bar over the periods of that cadence. Live
// models supply period / registry / lot hrefs and cadence tab hrefs; inventory
// draws unlabeled navs and inert tabs.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import type { ComplianceMonthsViewModel } from "@/lib/mgr/compliance-months-view";

export type { ComplianceMonthsViewModel };

export function ComplianceMonthsView({
  model,
  linkRows,
  cadenceHrefs,
}: {
  model: ComplianceMonthsViewModel;
  linkRows?: boolean;
  cadenceHrefs?: Record<string, string>;
}) {
  return (
    <>
      {E.hd("Compliance", "filing periods")}
      <TabBar names={model.cadences} on={model.cadence} cls="w-full" hrefs={cadenceHrefs} />
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
  );
}
