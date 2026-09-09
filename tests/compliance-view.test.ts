// tests/compliance-view.test.ts — Compliance months, registry, sheets, and
// lot trace. Views own no sample data. Live ApprovalForm / RegistrationForm /
// LicenseForm stay wrappers.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { BrandApprovalView } from "../components/mgr/views/brand-approval";
import { ComplianceMonthsView } from "../components/mgr/views/compliance-months";
import { ComplianceRegistryView } from "../components/mgr/views/compliance-registry";
import { LicenseView } from "../components/mgr/views/license";
import { LotTraceView } from "../components/mgr/views/lot-trace";
import { StateRegistrationView } from "../components/mgr/views/state-registration";
import {
  brandApprovalStout, complianceMonthsDemo, complianceRegistryDemo, licensePaBrewery, lotTraceHazy, stateRegistrationHazy,
} from "../lib/mgr/fixtures/compliance";
import { toBrandApprovalViewProps } from "../lib/mgr/brand-approval-view";
import { toComplianceMonthsViewProps } from "../lib/mgr/compliance-months-view";
import { toComplianceRegistryViewProps } from "../lib/mgr/compliance-registry-view";
import { toLicenseViewProps } from "../lib/mgr/license-view";
import { toLotTraceViewProps } from "../lib/mgr/lot-trace-view";
import { toStateRegistrationViewProps } from "../lib/mgr/state-registration-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Compliance months", () => {
  it("the Compliance months inventory record is ComplianceMonthsView", () => {
    const body = screen("Compliance months").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Compliance months").body)).toBe(true);
    expect(body.type).toBe(ComplianceMonthsView);
    expect(body.props.model).toEqual(toComplianceMonthsViewProps(complianceMonthsDemo));
  });

  it("renders registry and lot navs without leaking live hrefs", () => {
    const html = htmlOf(createElement(ComplianceMonthsView, { model: toComplianceMonthsViewProps(complianceMonthsDemo) }));
    expect(html).toMatch(/Compliance registry/);
    expect(html).toMatch(/L-240831-HZ/);
    expect(html).not.toMatch(/href="\/compliance/);
  });

  it("the live compliance page mounts ComplianceMonthsView", () => {
    const page = src("app/(app)/compliance/page.tsx");
    expect(page).toMatch(/<ComplianceMonthsView\b/);
    expect(page).not.toMatch(/SCREENS/);
  });
});

describe("Compliance registry", () => {
  it("the Compliance registry inventory record is ComplianceRegistryView", () => {
    const body = screen("Compliance registry").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ComplianceRegistryView);
    expect(body.props.model).toEqual(toComplianceRegistryViewProps(complianceRegistryDemo));
  });

  it("the live registry page mounts ComplianceRegistryView and slots the forms", () => {
    const page = src("app/(app)/compliance/registry/page.tsx");
    expect(page).toMatch(/<ComplianceRegistryView\b/);
    expect(page).toMatch(/<ApprovalForm\b/);
    expect(page).toMatch(/<RegistrationForm\b/);
    expect(page).toMatch(/<LicenseForm\b/);
    expect(page).not.toMatch(/import \{ E \}/);
    expect(page).not.toMatch(/\bE\./);
  });
});

describe("registry sheets", () => {
  it("the Brand approval inventory record is BrandApprovalView", () => {
    const body = screen("Brand approval").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(BrandApprovalView);
    expect(body.props.model).toEqual(toBrandApprovalViewProps(brandApprovalStout));
  });

  it("the State registration inventory record is StateRegistrationView", () => {
    const body = screen("State registration").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(StateRegistrationView);
    expect(body.props.model).toEqual(toStateRegistrationViewProps(stateRegistrationHazy));
  });

  it("the License inventory record is LicenseView", () => {
    const body = screen("License").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LicenseView);
    expect(body.props.model).toEqual(toLicenseViewProps(licensePaBrewery));
  });

  it("lets live callers suppress fixture form and row-action defaults with null", () => {
    expect(htmlOf(createElement(BrandApprovalView, { model: brandApprovalStout, form: null }))).not.toMatch(/Save approval/);
    expect(htmlOf(createElement(StateRegistrationView, { model: stateRegistrationHazy, form: null }))).not.toMatch(/Save registration/);
    expect(htmlOf(createElement(LicenseView, { model: licensePaBrewery, form: null }))).not.toMatch(/Save license/);
    const model = toComplianceRegistryViewProps(complianceRegistryDemo);
    const defaultRegistry = htmlOf(createElement(ComplianceRegistryView, { model }));
    const registry = htmlOf(createElement(ComplianceRegistryView, {
      model,
      actions: { cola: null },
    }));
    expect(registry.match(/>Edit<\/button>/g)).toHaveLength((defaultRegistry.match(/>Edit<\/button>/g)?.length ?? 0) - 1);
  });
});

describe("Lot trace", () => {
  it("the Lot trace inventory record is LotTraceView", () => {
    const body = screen("Lot trace").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(LotTraceView);
    expect(body.props.model).toEqual(toLotTraceViewProps(lotTraceHazy));
  });

  it("the live lot page mounts LotTraceView", () => {
    const page = src("app/(app)/compliance/lots/[id]/page.tsx");
    expect(page).toMatch(/<LotTraceView\b/);
    expect(page).not.toMatch(/import \{ E \}/);
    expect(page).not.toMatch(/\bE\./);
  });

  it("lets the live page suppress the inventory tape", () => {
    const html = htmlOf(createElement(LotTraceView, {
      model: toLotTraceViewProps(lotTraceHazy),
      tape: null,
      movements: createElement("p", null, "Live movements"),
    }));
    expect(html).not.toMatch(/production in/);
    expect(html).toMatch(/Live movements/);
  });

  it("keeps fixture links inert and preserves null slot suppression", () => {
    const model = toLotTraceViewProps({
      ...lotTraceHazy,
      recipients: [{ id: "order", order_no: 7, customers: { id: "customer", name: "Buyer" }, ship_tos: null, shipments: [{ id: "shipment", carrier: null, tracking: null, invoices: [{ id: "invoice", invoice_no: 9 }] }] }],
    });
    const html = htmlOf(createElement(LotTraceView, { model, tape: null, balances: null, recipients: null, movements: null }));
    expect(html).not.toMatch(/href="\/(orders|customers|invoices)/);
    expect(html).not.toMatch(/Recorded balances by SKU and bin[\s\S]*118 units/);
    expect(html).not.toMatch(/Order 7|production in/);
  });

  it("preserves live movement provenance and links", () => {
    const model = toLotTraceViewProps({
      ...lotTraceHazy,
      movements: [{ ...lotTraceHazy.movements[1], id: "return", type: "return_in", bin: "Returns", bbl: 0.13, ref: "credit", source_movement_id: "shipped" }],
    }, "/compliance");
    const html = htmlOf(createElement(LotTraceView, { model, tape: null }));
    expect(html).toMatch(/Returns · 2026-09-02/);
    expect(html).toMatch(/0\.13 bbl recorded/);
    expect(html).toMatch(/href="#movement-shipped"/);
    expect(html).toMatch(/href="\/invoices\/credit"/);
  });

  it("does not repeat a brand-owned SKU name and keeps the empty-recipient state", () => {
    const model = toLotTraceViewProps({
      ...lotTraceHazy,
      movements: [{ ...lotTraceHazy.movements[0], sku: "Hazy IPA · 16 oz case" }],
    }, "/compliance");
    const html = htmlOf(createElement(LotTraceView, { model, tape: null }));
    expect(html).toMatch(/Hazy IPA · 16 oz case/);
    expect(html).not.toMatch(/Hazy IPA · Hazy IPA/);
    expect(html).toMatch(/No recorded shipments of this lot/);
  });
});
