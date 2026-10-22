import { readFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { MonthlyComplianceView, PeriodBeforeBooksView } from "../components/mgr/views/monthly-compliance";
import { monthlyComplianceAmended, monthlyComplianceAugust } from "../lib/mgr/fixtures/monthly-compliance";
import { beforeBooksState, toMonthlyComplianceViewProps } from "../lib/mgr/monthly-compliance-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("Monthly compliance view", () => {
  it("explains a period that starts before the books opened instead of failing (#987)", () => {
    expect(beforeBooksState("October 2026", "2026-10-15", true)).toEqual({
      title: "Before the books opened",
      description: "October 2026 starts before the books opened on Oct 15, 2026, so MGR has no report for it. The books-opened date is in Settings.",
      action: { label: "Open Settings", href: "/settings" },
    });
    const body = SCREENS.find((screen) => screen.name === "Period before the books opened")!.body as { type: unknown };
    expect(body.type).toBe(PeriodBeforeBooksView);
    expect(htmlOf(body as ReactNode)).not.toMatch(/href="\/settings/);
    const admin = htmlOf(createElement(PeriodBeforeBooksView, { title: "October 2026", state: beforeBooksState("October 2026", "2026-10-15", true), backHref: "/compliance" }));
    expect(admin).toMatch(/href="\/settings"[^>]*>Open Settings/);
    expect(admin).toMatch(/Oct 15, 2026/);
  });

  it("gives Sales no Settings button, which would land on No access, only a sentence to ask an admin (#987 review)", () => {
    const sales = htmlOf(createElement(PeriodBeforeBooksView, { title: "October 2026", state: beforeBooksState("October 2026", "2026-10-15", false), backHref: "/compliance" }));
    expect(sales).toContain("Ask an admin to change the books-opened date.");
    expect(sales).not.toContain("Open Settings");
    expect(sales).not.toContain("/settings");
  });

  it("owns the inventory drawing", () => {
    const body = SCREENS.find((screen) => screen.name === "Monthly compliance")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(body)).toBe(true);
    expect(body.type).toBe(MonthlyComplianceView);
    expect(body.props.model).toEqual(toMonthlyComplianceViewProps(monthlyComplianceAugust));
  });

  it("dates the filing by the brewery's day, not filed_at's UTC prefix (#991)", () => {
    const model = toMonthlyComplianceViewProps({ ...monthlyComplianceAmended, timeZone: "America/New_York", filing: { ...monthlyComplianceAmended.filing!, filed_at: "2026-09-03T02:00:00Z" } });
    expect(model.filingDate).toBe("Sep 2, 2026");
  });

  it("draws the period in progress: reviewable, a when-to-record line replaces Save (#579, #1143)", () => {
    const body = SCREENS.find((screen) => screen.name === "Period in progress")!.body as { type: unknown; props: { monthOpen?: boolean } };
    expect(body.type).toBe(MonthlyComplianceView);
    expect(body.props.monthOpen).toBe(true);
    const html = htmlOf(body as ReactNode);
    expect(html).toMatch(/September 2026/);
    expect(html).toMatch(/You can record the filing after September 2026 ends/);
    expect(html).not.toMatch(/Save filed snapshot/);
  });

  it("says before Save that MGR does not file with TTB, in plain sentence-case copy (#1143)", () => {
    const html = htmlOf(createElement(MonthlyComplianceView, { model: toMonthlyComplianceViewProps(monthlyComplianceAugust) }));
    const notice = html.indexOf("MGR does not file with TTB");
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(html.indexOf("Save filed snapshot"));
    expect(html).not.toMatch(/auto-reconciled|immutable|transmit|\bfacts\b|outward|removal category|allocations change/i);
    for (const header of ["Class", "Begin", "In", "Out", "End", "State", "Removed (bbl)", "Returned (bbl)", "Adjustments (bbl)", "Net (bbl)", "Sales", "Credits", "Net sales"]) expect(html).toContain(`>${header}</th>`);
    expect(toMonthlyComplianceViewProps(monthlyComplianceAugust).lines.map((line) => line[0])).toEqual(["Kegs", "Cans", "Bottles"]);
  });

  it("names why Save is off beside it while the report does not balance (#1143, #1122)", () => {
    expect(toMonthlyComplianceViewProps(monthlyComplianceAugust).fileReason).toBeNull();
    const unbalanced = { ...monthlyComplianceAugust, report: { figures: { ...monthlyComplianceAugust.report.figures, balances: false }, warnings: ["keg does not balance"] } };
    const model = toMonthlyComplianceViewProps(unbalanced);
    expect(model.fileReason).toBe("Still needed: figures that balance. Step 2 names what does not.");
    const html = htmlOf(createElement(MonthlyComplianceView, { model }));
    const save = html.match(/<button[^>]*>Save filed snapshot<\/button>/)?.[0] ?? "";
    expect(save).toMatch(/\sdisabled=""/);
    const describedBy = save.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toMatch(new RegExp(`<p id="${describedBy}"[^>]*>${model.fileReason}</p>`));
  });

  it("keeps fixture actions inert and supports null live actions", () => {
    const model = toMonthlyComplianceViewProps(monthlyComplianceAugust);
    const fixture = htmlOf(createElement(MonthlyComplianceView, { model }));
    expect(fixture).not.toMatch(/href="\/compliance/);
    expect(fixture).toMatch(/0\.05741935 bbl/);
    expect(fixture).toMatch(/Destination PA · prior allocation/);
    expect(htmlOf(createElement(MonthlyComplianceView, { model, lossAction: () => null, fileAction: null }))).not.toMatch(/Reattribute loss|Save filed snapshot/);
  });

  it("names which loss each review row is, since a batch can have several (#485)", () => {
    const [completion] = monthlyComplianceAugust.losses;
    const model = toMonthlyComplianceViewProps({ ...monthlyComplianceAugust, losses: [completion, { ...completion, adjustment_id: "loss-transfer", kind: "transfer", closed_at: null }] });
    expect(model.losses.map((loss) => loss.title)).toEqual(["Batch 1042 · completion loss", "Batch 1042 · transfer loss"]);
  });

  it("the live route mounts the shared view and slots both mutation controls", () => {
    const page = readFileSync("app/(app)/compliance/[period]/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/monthly-compliance"/);
    expect(page).toMatch(/<MonthlyComplianceView\b/);
    expect(page).toMatch(/<LossReviewForm\b/);
    expect(page).toMatch(/<FileButton\b/);
    expect(page).not.toMatch(/\bE\./);
  });
});

it("exports the same retained facts and never invents an export for an older filing", () => {
  const model = toMonthlyComplianceViewProps(monthlyComplianceAugust);
  expect(model.stateExport?.facts.map(row => row.sourceId)).toContain("shipment-PA");
  expect(model.stateRows.find(row => row[0] === "PA")?.at(-1)).toBe("$24,600.00");
  const legacy = { ...monthlyComplianceAugust, report: { ...monthlyComplianceAugust.report, figures: { ...monthlyComplianceAugust.report.figures, stateTransactions: undefined } } };
  expect(toMonthlyComplianceViewProps(legacy).stateExport).toBeUndefined();
  expect(htmlOf(createElement(MonthlyComplianceView, { model }))).toContain("Export state transactions");
});
