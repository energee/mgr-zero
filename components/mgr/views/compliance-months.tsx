// components/mgr/views/compliance-months.tsx — Compliance months list: a
// Monthly / Quarterly / Annual tab bar over the periods of that cadence, then
// Licenses, then Lot trace: a lot-code search and the lots it found. Live
// models supply period / registry / lot hrefs and cadence tab hrefs; inventory
// draws unlabeled navs and inert tabs.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { TabBar } from "@/components/mgr/qty";
import type { ComplianceMonthsViewModel } from "@/lib/mgr/compliance-months-view";

export function ComplianceMonthsView({
  model,
  linkRows,
  cadenceHrefs,
  controls,
}: {
  model: ComplianceMonthsViewModel;
  linkRows?: boolean;
  cadenceHrefs?: Record<string, string>;
  /** The lot-code search strip (components/mgr/list-controls.tsx). */
  controls?: ReactNode;
}) {
  return (
    <>
      {E.back("More", "Compliance", undefined, model.backHref)}
      <TabBar names={model.cadences} on={model.cadence} cls="w-full" hrefs={cadenceHrefs} />
      {/* The div keeps E.blank's flex-1 from stretching the empty state down to Licenses (#1496). */}
      {model.months.length === 0 && model.empty ? <div>{E.blank(model.empty)}</div> : null}
      {model.months.map((row) => (
        <Fragment key={row.key}>
          {E.nav(row.title, row.detail, row.tone ?? "", undefined, linkRows ? row.href : undefined)}
        </Fragment>
      ))}
      {E.nav(model.registry.title, model.registry.detail, "", undefined, linkRows ? model.registry.href : undefined)}
      {E.ttl("Lot trace")}
      {controls}
      {model.lotsEmpty ? E.blank(model.lotsEmpty) : null}
      {model.lots.map((row) => (
        <Fragment key={row.key}>
          {E.nav(row.title, row.detail, "", undefined, linkRows ? row.href : undefined)}
        </Fragment>
      ))}
    </>
  );
}
