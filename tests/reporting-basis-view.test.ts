import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportingBasisView } from "@/components/mgr/views/reporting-basis";
import { MonthlyComplianceView } from "@/components/mgr/views/monthly-compliance";
import { SettingsView } from "@/components/mgr/views/settings";
import { SCREENS } from "@/components/mgr/screens";
import { monthlyComplianceAmended } from "@/lib/mgr/fixtures/monthly-compliance";
import { settingsDemo } from "@/lib/mgr/fixtures/settings";
import { toMonthlyComplianceViewProps } from "@/lib/mgr/monthly-compliance-view";
import { deniedFor, needsFor } from "@/lib/mgr/demo-personas";

describe("reporting basis correction presentation", () => {
  it("keeps the correction form admin-only and amended filing review available to Sales", () => {
    expect(needsFor("Settings")).toEqual(["admin"]);
    expect(needsFor("Filed period needs amendment")).toEqual(["admin", "sales"]);
    expect(deniedFor(["brewer"], "Filed period needs amendment")).toBe(true);
  });

  it("shares the amendment surface with the inventory and preserves original balances beside corrected evidence", () => {
    const body = SCREENS.find(screen => screen.name === "Filed period needs amendment")!.body;
    expect(isValidElement(body) && body.type).toBe(MonthlyComplianceView);
    const model = toMonthlyComplianceViewProps(monthlyComplianceAmended);
    expect(isValidElement<{ model: unknown }>(body) && body.props.model).toEqual(model);
    expect(model.lines.find(line => line[0] === "cans")).toEqual(["cans", "12.60", "18.00", "14.90", "15.70"]);
    expect(model.amendments?.[0].figures.lines.find(line => line[0] === "cans")).toEqual(["cans", "14.60", "18.00", "14.90", "17.70"]);
    const html = renderToStaticMarkup(createElement(MonthlyComplianceView, { model }));
    expect(html).toContain("Needs amendment");
    expect(html).toContain("Latest recorded correction");
    expect(html).toContain("Include verified opening inventory");
    expect(html).toContain("2026-09-03T14:30:00Z");
    expect(html).toContain("Actor");
    expect(html).not.toContain("Save filed snapshot");
  });

  it("retains corrected destination totals and export facts separately from the original snapshot", () => {
    const snapshot = structuredClone(monthlyComplianceAmended);
    const amended = snapshot.filing!.basis_amendments![0];
    amended.new_figures.stateTransactions = [{ ...snapshot.report.figures.stateTransactions![0], state: "Unassigned" }];
    const model = toMonthlyComplianceViewProps(snapshot);
    expect(model.stateRows.some(row => row[0] === "PA")).toBe(true);
    expect(model.amendments?.[0].figures.stateRows.map(row => row[0])).toEqual(["Unassigned"]);
    expect(model.amendments?.[0].figures.stateExport?.facts).toEqual(amended.new_figures.stateTransactions);
    const html = renderToStaticMarkup(createElement(MonthlyComplianceView, { model }));
    expect(html).toContain("Unassigned");
    expect(html.match(/Export state transactions/g)).toHaveLength(2);
  });

  it("locks the ordinary field after filing and mounts the same correction form in Settings", () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { model: settingsDemo }));
    expect(html).toContain("Correct reporting basis");
    expect(html).toContain("Current books opened on");
    expect(html).toContain("Reporting basis history");
    expect(html).toContain("Record correction and flag amendments");
    expect(html).toContain("Filed reporting basis");
    const ordinaryDate = html.match(/<button[^>]*aria-describedby="([^"]*booksOpenedOn-help)"[^>]*>/);
    expect(ordinaryDate).not.toBeNull();
    expect(ordinaryDate![0]).toContain('disabled=""');
    expect(html).toContain(`id="${ordinaryDate![1]}"`);
    const beforeFiling = renderToStaticMarkup(createElement(SettingsView, { model: { ...settingsDemo, hasFiledReports: false } }));
    expect(beforeFiling).not.toContain("Record correction and flag amendments");
    const editableDate = beforeFiling.match(/<button[^>]*aria-describedby="([^"]*booksOpenedOn-help)"[^>]*>/);
    expect(editableDate).not.toBeNull();
    expect(editableDate![0]).not.toContain('disabled=""');
    expect(beforeFiling).toContain(`id="${editableDate![1]}"`);
  });

  it("requires a reason and explicit acknowledgement, and freezes uncertain requests for unchanged retry", () => {
    const html = renderToStaticMarkup(createElement(ReportingBasisView, { basis: "2026-01-01", history: [], timeZone: "America/New_York" }));
    expect(html).toMatch(/required=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Record correction and flag amendments/);
    const locked = renderToStaticMarkup(createElement(ReportingBasisView, { basis: "2026-01-01", history: [], timeZone: "America/New_York", locked: true, error: "Response uncertain", onRetry: () => {} }));
    expect(locked).toContain("Retry unchanged correction");
    expect(locked).toContain("Response uncertain");
    expect(locked).not.toContain(">Record correction and flag amendments");
    expect(locked).toMatch(/<input[^>]*disabled=""/);
  });

  it("explains a filing invalidated by the new books-opened date", () => {
    const snapshot = structuredClone(monthlyComplianceAmended);
    snapshot.filing!.basis_amendments![0].correction.new_basis = "2026-09-01";
    const model = toMonthlyComplianceViewProps(snapshot);
    expect(model.amendments?.[0].invalidPeriod).toBe(true);
    expect(renderToStaticMarkup(createElement(MonthlyComplianceView, { model }))).toContain("cannot be generated under this basis");
  });
});
