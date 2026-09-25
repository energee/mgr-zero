import { readFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { MonthlyComplianceView } from "../components/mgr/views/monthly-compliance";
import { monthlyComplianceAugust } from "../lib/mgr/fixtures/monthly-compliance";
import { toMonthlyComplianceViewProps } from "../lib/mgr/monthly-compliance-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("Monthly compliance view", () => {
  it("owns the inventory drawing", () => {
    const body = SCREENS.find((screen) => screen.name === "Monthly compliance")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(body)).toBe(true);
    expect(body.type).toBe(MonthlyComplianceView);
    expect(body.props.model).toEqual(toMonthlyComplianceViewProps(monthlyComplianceAugust));
  });

  it("draws the period in progress: reviewable, File once the period ends replaces Save (#579)", () => {
    const body = SCREENS.find((screen) => screen.name === "Period in progress")!.body as { type: unknown; props: { monthOpen?: boolean } };
    expect(body.type).toBe(MonthlyComplianceView);
    expect(body.props.monthOpen).toBe(true);
    const html = htmlOf(body as ReactNode);
    expect(html).toMatch(/September 2026/);
    expect(html).toMatch(/File once the period ends/);
    expect(html).not.toMatch(/Save filed snapshot/);
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
