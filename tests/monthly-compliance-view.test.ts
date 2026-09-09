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

  it("keeps fixture actions inert and supports null live actions", () => {
    const model = toMonthlyComplianceViewProps(monthlyComplianceAugust);
    const fixture = htmlOf(createElement(MonthlyComplianceView, { model }));
    expect(fixture).not.toMatch(/href="\/compliance/);
    expect(htmlOf(createElement(MonthlyComplianceView, { model, lossAction: () => null, fileAction: null }))).not.toMatch(/Reattribute loss|Save filed snapshot/);
  });

  it("the live route mounts the shared view and slots both mutation controls", () => {
    const page = readFileSync("app/(app)/compliance/[month]/page.tsx", "utf8");
    expect(page).toMatch(/from "@\/components\/mgr\/views\/monthly-compliance"/);
    expect(page).toMatch(/<MonthlyComplianceView\b/);
    expect(page).toMatch(/<LossReviewForm\b/);
    expect(page).toMatch(/<FileButton\b/);
    expect(page).not.toMatch(/\bE\./);
  });
});
