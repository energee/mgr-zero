// tests/qa-chrome-copy.test.ts — chrome copy the 2026-09-13 QA sweep flagged:
// breadcrumbs that name the wrong parent (#258, #259), section nouns that
// disagree with their page (#261), and timestamps that bypass the shared
// formatters (#253).
import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { ContractsView } from "@/components/mgr/views/contracts";
import { PriceGroupsView } from "@/components/mgr/views/price-groups";
import { LicensesView } from "@/components/mgr/views/licenses";
import { toContractsViewProps } from "@/lib/mgr/contracts-view";
import { toPriceGroupsViewProps } from "@/lib/mgr/price-groups-view";
import { toLicensesViewProps } from "@/lib/mgr/licenses-view";
import { licensesDemo } from "@/lib/mgr/fixtures/compliance";
import { pricingGrid } from "@/lib/mgr/fixtures/pricing";
import { moreNavs } from "@/lib/mgr/fixtures/more";
import { taproomTodayRows } from "@/lib/mgr/taproom-today";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const src = (file: string) => readFileSync(file, "utf8");

describe("breadcrumb parents name the destination the user came from", () => {
  it("Price groups points back at More, not Catalog (#258)", () => {
    const html = htmlOf(createElement(PriceGroupsView, { model: toPriceGroupsViewProps(pricingGrid) }));
    expect(html).toMatch(/More/);
    expect(html).not.toMatch(/Catalog/);
  });

  it("compliance children point back at Compliance, not the internal list name (#259)", () => {
    expect(htmlOf(createElement(LicensesView, { model: toLicensesViewProps(licensesDemo) }))).not.toMatch(/Compliance months/);
    for (const file of ["components/mgr/views/monthly-compliance.tsx", "components/mgr/views/lot-trace.tsx"]) {
      expect(src(file)).not.toMatch(/"Compliance months"/);
    }
  });
});

describe("section nouns agree with the page they sit on (#261)", () => {
  it("an empty contracts list says contracts, not commitments", () => {
    expect(toContractsViewProps({ rows: [] }).empty).toBe("No contracts yet");
  });

  it("Contracts accepts a header so the Vendors page does not link to itself", () => {
    const html = htmlOf(createElement(ContractsView, {
      model: toContractsViewProps({ rows: [] }),
      header: E.hd("Contracts", "committed quantities"),
    }));
    expect(html).not.toMatch(/Vendors/);
    expect(src("app/(app)/vendors/page.tsx")).toMatch(/header=\{E\.hd\("Contracts"/);
  });

  it("the More card for Vendors reads the same as the Vendors page subtitle", () => {
    expect(moreNavs.find((nav) => nav.key === "vendors")?.detail).toBe("who you buy from");
  });
});

describe("timestamps use the shared formatters (#253)", () => {
  it("Taproom today rows carry no seconds and no bare ISO date", () => {
    const detail = taproomTodayRows(
      { id: "11111111-1111-4111-8111-111111111111", name: "Main taproom" },
      [],
      [{ counted_on: "2026-09-07", created_at: "2026-09-07T14:00:00Z" }],
      { as_of: "2026-09-08T15:00:00Z", reason: null, rows: [{ variance_bbl: 0 }], periods: [{ coverage_complete: true, reason: null }] },
    ).map((row) => row.detail).join(" · ");
    expect(detail).toContain("Sep 8, 2026");
    expect(detail).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(detail).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it("no view formats a user-facing timestamp with toLocaleString", () => {
    for (const file of ["components/mgr/views/tap-board.tsx", "components/mgr/views/taproom-variance.tsx", "components/mgr/views/weekly-count.tsx", "lib/mgr/taproom-today.ts"]) {
      expect(src(file)).not.toMatch(/new Date\([^)]*\)\.toLocale(String|DateString)\(\)/);
    }
  });

  it("the Weekly count note dates the server day through the shared formatter", () => {
    expect(src("components/mgr/views/weekly-count.tsx")).toMatch(/formatDate\(state\.draft\.countedOn\)/);
  });
});
