import { readFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { MonthlyComplianceView, PeriodBeforeBooksView } from "../components/mgr/views/monthly-compliance";
import { DestinationStateExport } from "../components/mgr/views/destination-state-export";
import { monthlyComplianceAmended, monthlyComplianceAugust, monthlyComplianceUnbalanced } from "../lib/mgr/fixtures/monthly-compliance";
import { beforeBooksState, toMonthlyComplianceViewProps } from "../lib/mgr/monthly-compliance-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("compliance period status (#1310)", () => {
  it.each([
    ["2026-08-01", "2026-08-31", "Past"],
    ["2026-09-01", "2026-09-30", "Current"],
    ["2026-10-01", "2026-10-31", "Upcoming"],
    ["2026-07-01", "2026-09-30", "Current"],
    ["2025-01-01", "2025-12-31", "Past"],
    ["2030-01-01", "2030-12-31", "Upcoming"],
  ])("labels %s through %s as %s independently of report balance", (periodStart, periodEnd, status) => {
    const report = { figures: { ...monthlyComplianceAugust.report.figures, periodStart, periodEnd, inProcessAsOf: status === "Past" ? periodEnd : undefined }, warnings: [] };
    const model = toMonthlyComplianceViewProps({ ...monthlyComplianceAugust, today: "2026-09-30", report });
    expect(model.periodStatus).toBe(status);
    const html = htmlOf(createElement(MonthlyComplianceView, { model }));
    expect(html).toContain(`>${status}</span>`);
    expect(html).toContain("Live figures");
    expect(html).toContain("not a saved filing");
    if (status !== "Past") {
      expect(html).not.toContain("Save filed snapshot");
    }
    if (status === "Upcoming") expect(html).toContain("This period has not started");
  });

  it("does not relabel an unbalanced past report as current or replace a filed snapshot", () => {
    const model = toMonthlyComplianceViewProps(monthlyComplianceUnbalanced);
    expect(model.periodStatus).toBe("Past");
    const html = htmlOf(createElement(MonthlyComplianceView, { model }));
    expect(html).toContain(">Past</span>");
    expect(html).toContain("Does not balance");
    const filed = htmlOf(createElement(MonthlyComplianceView, { model: toMonthlyComplianceViewProps(monthlyComplianceAmended) }));
    expect(filed).toContain("Filed Sep 2, 2026");
    expect(filed).not.toContain("Live figures are generated");
    expect(filed).not.toContain("Save filed snapshot");
  });

  it("explains an empty state export and disables its download", () => {
    const report = { figures: { ...monthlyComplianceAugust.report.figures, stateTransactions: [] }, warnings: [] };
    const model = toMonthlyComplianceViewProps({ ...monthlyComplianceAugust, report });
    const html = htmlOf(createElement(MonthlyComplianceView, { model }));
    expect(html).toContain("No transactions in this period. Nothing to export.");
    expect(html.match(/<button[^>]*>Export state transactions<\/button>/)?.[0]).toContain('disabled=""');
    const exportButton = DestinationStateExport(model.stateExport!).props.children[1];
    expect(exportButton.props.disabled).toBe(true);
    expect(exportButton.props.onClick).toBeUndefined();
    const populated = toMonthlyComplianceViewProps(monthlyComplianceAugust);
    const populatedButton = DestinationStateExport(populated.stateExport!).props.children[1];
    expect(populatedButton.props.disabled).toBe(false);
    expect(populatedButton.props.onClick).toBeTypeOf("function");
  });
});

describe("Monthly compliance view", () => {
  it("explains a period that starts before the books opened instead of failing (#987)", () => {
    expect(beforeBooksState("October 2026", "2026-10-15", true, "2026-10-20")).toEqual({
      title: "Before the books opened",
      description: "October 2026 starts before the books opened on Oct 15, 2026, so MGR has no report for it. Activity before that date is not reported in MGR. The books-opened date is in Settings.",
      action: { label: "Open Settings", href: "/settings" },
    });
    const body = SCREENS.find((screen) => screen.name === "Period before the books opened")!.body as { type: unknown };
    expect(body.type).toBe(PeriodBeforeBooksView);
    expect(htmlOf(body as ReactNode)).not.toMatch(/href="\/settings/);
    const admin = htmlOf(createElement(PeriodBeforeBooksView, { title: "October 2026", state: beforeBooksState("October 2026", "2026-10-15", true, "2026-10-20"), backHref: "/compliance" }));
    expect(admin).toMatch(/href="\/settings"[^>]*>Open Settings/);
    expect(admin).toMatch(/Oct 15, 2026/);
  });

  it("gives Sales no Settings button, which would land on No access, only a sentence to ask an admin (#987 review)", () => {
    const sales = htmlOf(createElement(PeriodBeforeBooksView, { title: "October 2026", state: beforeBooksState("October 2026", "2026-10-15", false, "2026-10-20"), backHref: "/compliance" }));
    expect(sales).toContain("Ask an admin to change the books-opened date.");
    expect(sales).not.toContain("Open Settings");
    expect(sales).not.toContain("/settings");
  });

  it("says the books open, not opened, while that day is still ahead (#1496)", () => {
    expect(beforeBooksState("October 2026", "2026-11-01", false, "2026-10-26").description).toBe(
      "October 2026 starts before the books open on Nov 1, 2026, so MGR has no report for it. Activity before that date is not reported in MGR. Ask an admin to change the books-opened date.",
    );
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
    const body = SCREENS.find((screen) => screen.name === "Period in progress")!.body as { type: unknown; props: { model: { periodStatus: string } } };
    expect(body.type).toBe(MonthlyComplianceView);
    expect(body.props.model.periodStatus).toBe("Current");
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

  it("names why Save is off beside it, in the same words as the step 2 notes (#1143, #1122)", () => {
    expect(toMonthlyComplianceViewProps(monthlyComplianceAugust).fileReason).toBeNull();
    const model = toMonthlyComplianceViewProps(monthlyComplianceUnbalanced);
    // The non-blocking Unassigned note stays in step 2 and out of the reason.
    expect(model.warnings).toEqual([
      "Kegs do not balance.",
      "Keg swap movements have no report column.",
      "Some transactions have no recorded destination. Check the Unassigned row; MGR does not guess a state.",
    ]);
    expect(model.fileReason).toBe("Save is off: Kegs do not balance. Keg swap movements have no report column.");
    const body = SCREENS.find((screen) => screen.name === "Report does not balance")!.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(MonthlyComplianceView);
    expect(body.props.model).toEqual(model);
    const html = htmlOf(body as ReactNode);
    expect(html).not.toMatch(/\bfacts\b|does not balance|unclassified/);
    const save = html.match(/<button[^>]*>Save filed snapshot<\/button>/)?.[0] ?? "";
    expect(save).toMatch(/\sdisabled=""/);
    const describedBy = save.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toContain(`<p id="${describedBy}" class="text-sm text-muted-foreground md:self-center">${model.fileReason}</p>`);
  });

  it("passes an unknown server warning through unchanged and still withholds Save", () => {
    const report = { figures: { ...monthlyComplianceAugust.report.figures, balances: false }, warnings: ["something new"] };
    const model = toMonthlyComplianceViewProps({ ...monthlyComplianceAugust, report });
    expect(model.warnings).toEqual(["something new"]);
    expect(model.fileReason).toBe("Save is off: something new");
  });

  it("on a filed period says the snapshot is the record, not to record it again (#1143)", () => {
    const html = htmlOf(createElement(MonthlyComplianceView, { model: toMonthlyComplianceViewProps(monthlyComplianceAmended) }));
    expect(html).toContain("MGR does not file with TTB or the state. This snapshot records the figures as filed.");
    expect(html).not.toMatch(/then record the filing here/);
  });

  it("keeps fixture actions inert and supports null live actions", () => {
    const model = toMonthlyComplianceViewProps(monthlyComplianceAugust);
    const fixture = htmlOf(createElement(MonthlyComplianceView, { model }));
    expect(fixture).not.toMatch(/href="\/compliance/);
    expect(fixture).toMatch(/0\.05741935 bbl/);
    expect(fixture).toMatch(/Destination PA · reattributed earlier/);
    expect(fixture).toMatch(/Recorded 0\.05741935 bbl · 0\.03741935 bbl left to reattribute/);
    expect(fixture).not.toMatch(/generic|prior allocation|Frozen|non-additive/);
    expect(htmlOf(createElement(MonthlyComplianceView, { model, lossAction: () => null, fileAction: null }))).not.toMatch(/Reattribute loss|Save filed snapshot/);
  });

  it("names which loss each review row is, since a batch can have several (#485)", () => {
    const [completion] = monthlyComplianceAugust.losses;
    const model = toMonthlyComplianceViewProps({ ...monthlyComplianceAugust, losses: [completion, { ...completion, adjustment_id: "loss-transfer", kind: "transfer", closed_at: null }] });
    expect(model.losses.map((loss) => loss.title)).toEqual(["B-1042 · completion loss", "B-1042 · transfer loss"]);
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
